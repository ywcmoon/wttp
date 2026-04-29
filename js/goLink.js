// goLink 页面核心功能
// 功能：实现探索模式下的卡片组拖拽、连线、详情查看等核心交互
// 作者：系统生成
// 日期：2026-04-23
(function () {
    'use strict';

    // ==================== DOM 元素获取 ====================
    const svg = document.getElementById('golink-connections-svg'); // SVG 画布，用于绘制连线
    const container = document.getElementById('golink-workspace'); // 主工作区容器
    const stopBtn = document.getElementById('golink-stop-btn'); // 终止探索按钮
    const submitBtn = document.getElementById('golink-submit-btn'); // 提交/下一步按钮

    // ==================== 核心状态变量 ====================
    let connections = []; // 存储所有连线数据
    let connId = 0; // 连线 ID 计数器，用于生成唯一 ID
    let isDraggingConn = false; // 是否正在拖拽连线
    let startX, startY, curStartPt = null, tempPath = null; // 连线拖拽临时变量

    // 状态管理
    let currentMode = 'connect'; // 当前模式：'connect'（连线模式）| 'compare'（对比模式）| 'drag'（拖拽模式）
    let currentZoom = 100; // 缩放等级，百分比

    // 卡片组拖拽状态
    let isDraggingGroup = false; // 是否正在拖拽卡片组
    let dragStartXGroup = 0; // 拖拽起始 X 坐标
    let dragStartYGroup = 0; // 拖拽起始 Y 坐标
    let groupOffsetX = 0; // 卡片组整体 X 偏移
    let groupOffsetY = 0; // 卡片组整体 Y 偏移
    let groupDragTimer = null; // 长按拖拽计时器

    // ==================== 初始化 ====================
    // 页面加载完成后初始化所有功能
    document.addEventListener('DOMContentLoaded', function () {
        initButtons(); // 初始化按钮事件
        loadAndRenderCards(); // 加载并渲染卡片
        initModal(); // 初始化详情弹窗
        initZoom(); // 初始化缩放功能
        initWheelZoom(); // 初始化鼠标滚轮缩放
    });

    // ==================== 按钮初始化 ====================
    function initButtons() {
        // 终止探索按钮
        stopBtn.addEventListener('click', function () {
            handleStopExplore();
        });

        // 提交/下一步/继续探索按钮
        submitBtn.addEventListener('click', function () { 
            saveLs3Connections()
            handleSubmitBtn();
        });
    }

    // ==================== 终止探索功能 ====================
    // 终止当前探索并返回探索列表
    function handleStopExplore() {
        if (confirm('确定要终止探索吗？')) {
            // 清除学生连线数据
            localStorage.removeItem('ls3');
            // 跳转到 exploreList 页面
            window.location.href = 'exploreList.html';
        }
    }

    // ==================== 提交按钮状态管理 ====================
    // 处理提交按钮的状态切换
    function handleSubmitBtn() {
        if (currentMode === 'connect') {
            // 连线模式 -> 对比模式
            currentMode = 'compare';
            submitBtn.innerHTML = '<i class="fas fa-forward"></i> 下一步';
            renderCompareView(); // 渲染对比视图
            showExploreHeader(); // 显示图例导航
        } else if (currentMode === 'compare') {
            // 对比模式 -> 拖拽模式
            currentMode = 'drag';
            submitBtn.innerHTML = '<i class="fas fa-arrow-left"></i> 继续探索';
            renderDragView(); // 渲染拖拽视图
        } else if (currentMode === 'drag') {
            // 拖拽模式 -> 返回探索列表
            window.location.href = 'exploreList.html';
        }
    }

    // ==================== 渲染不同视图 ====================
 

    // 渲染对比模式视图
    function renderCompareView() {
        // 清除现有连线
        clearAllConnections();

        // 读取标准答案和学生答案
        const ls1 = JSON.parse(localStorage.getItem('ls1') || '{"connections":[]}');
        const ls3 = JSON.parse(localStorage.getItem('ls3') || '{"connections":[]}');

        // 渲染所有连线（标准答案+学生答案）
        renderCompareConnections(ls1.connections, ls3.connections);
    }

    function renderDragView() {
        // 清除现有连线
        clearAllConnections();

        // 读取标准答案
        const ls1 = JSON.parse(localStorage.getItem('ls1') || '{"connections":[]}');

        // 渲染正确的实线
        renderCorrectConnections(ls1.connections);

        // 显示缩放指示器
        showZoomIndicator();

        // 启用卡片组拖拽
        enableCardGroupDrag();
    }

    // ==================== 卡片组拖拽功能 ====================
    // 启用卡片组拖拽功能
    function enableCardGroupDrag() {
        // 移除可能存在的旧事件，避免重复绑定
        const cards = document.querySelectorAll('.w_contp_item');
        cards.forEach(card => {
            card.removeEventListener('mousedown', handleCardMouseDown);
            card.removeEventListener('touchstart', handleCardTouchStart, { passive: false });
        });
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('touchmove', handleDragMove, { passive: false });
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchend', handleDragEnd);
        document.removeEventListener('mouseleave', handleDragEnd);

        // 添加新事件
        cards.forEach(card => {
            card.addEventListener('mousedown', handleCardMouseDown);
            card.addEventListener('touchstart', handleCardTouchStart, { passive: false });
            card.style.cursor = 'grab'; // 设置鼠标样式为可拖拽
        });
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('touchmove', handleDragMove, { passive: false });
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchend', handleDragEnd);
        document.addEventListener('mouseleave', handleDragEnd);
    }

    // 拖拽状态变量
    let dragActive = false; // 是否激活拖拽
    let dragStartX = 0; // 拖拽起始 X 坐标
    let dragStartY = 0; // 拖拽起始 Y 坐标
    let offsetX = 0; // 鼠标点击位置与卡片组的偏移量
    let offsetY = 0; // 鼠标点击位置与卡片组的偏移量

    // 处理卡片鼠标按下事件
    function handleCardMouseDown(e) {
        if (currentMode !== 'drag') return; // 仅在拖拽模式下生效

        const card = e.target.closest('.w_contp_item');
        if (!card) return; // 确保点击的是卡片区域

        // 阻止默认行为和冒泡，避免干扰其他事件
        e.preventDefault();
        e.stopPropagation();

        // 记录起始位置（考虑当前偏移）
        dragStartX = e.clientX - groupOffsetX;
        dragStartY = e.clientY - groupOffsetY;
        dragActive = true;
        // 改变所有卡片的鼠标样式为拖拽中
        document.querySelectorAll('.w_contp_item').forEach(c => {
            c.style.cursor = 'grabbing';
        });
    }

    // 处理卡片触摸开始事件（移动端）
    function handleCardTouchStart(e) {
        if (currentMode !== 'drag') return; // 仅在拖拽模式下生效

        const card = e.target.closest('.w_contp_item');
        if (!card) return; // 确保触摸的是卡片区域

        e.preventDefault();
        e.stopPropagation();

        const touch = e.touches[0];
        // 记录起始位置（考虑当前偏移）
        dragStartX = touch.clientX - groupOffsetX;
        dragStartY = touch.clientY - groupOffsetY;
        dragActive = true;
        // 改变所有卡片的鼠标样式为拖拽中
        document.querySelectorAll('.w_contp_item').forEach(c => {
            c.style.cursor = 'grabbing';
        });
    }

    // 将屏幕坐标转换为 SVG 坐标系的函数（处理 viewBox 缩放偏移）
    function getSVGCoords(clientX, clientY, svg) {
        const pt = svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        return pt.matrixTransform(svg.getScreenCTM().inverse());
    }

    // 处理拖拽移动事件
    function handleDragMove(e) {
        if (!dragActive || currentMode !== 'drag') {
            return;
        }

        e.preventDefault();

        // 获取当前鼠标/触摸位置
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        // 计算新的偏移量（实时更新，无延迟）
        groupOffsetX = clientX - dragStartX;
        groupOffsetY = clientY - dragStartY;

        // 立即应用变换到卡片组
        applyGroupTransform();

        // 实时更新所有连线位置
        updateAllConnections();
    }

    // 应用卡片组变换（平移和缩放）
    function applyGroupTransform() {
        const golinkCont = document.querySelector('.golink-cont');
        if (golinkCont) {
            const scale = currentZoom / 100; // 转换为缩放比例
            // 先平移后缩放，确保拖拽位置准确
            golinkCont.style.transform = `translate(${groupOffsetX}px, ${groupOffsetY}px) scale(${scale})`;
            golinkCont.style.transformOrigin = 'top left'; // 以左上角为原点
        }
    }

    // 鼠标滚轮缩放功能
    function initWheelZoom() {
        const container = document.getElementById('golink-workspace');
        if (!container) return;

        container.addEventListener('wheel', handleWheelZoom, { passive: false });
    }

    function handleWheelZoom(e) {
        if (currentMode !== 'drag') return;

        e.preventDefault();

        // 计算缩放增量
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(20, Math.min(300, currentZoom * delta));

        // 应用缩放
        currentZoom = newZoom;
        applyGroupTransform();
        updateAllConnections();

        // 更新缩放指示器
        const indicator = document.getElementById('zoom-indicator');
        if (indicator) {
            indicator.textContent = `${Math.round(currentZoom)}%`;
        }
    }

    // 处理拖拽结束事件
    function handleDragEnd() {
        // 恢复鼠标样式并重置拖拽状态
        if (dragActive) {
            document.querySelectorAll('.w_contp_item').forEach(c => c.style.cursor = 'grab');
        }
        dragActive = false;
    }

    // ==================== 连线对比渲染 ====================
    // 渲染教师答案与学生答案的对比连线
    function renderCompareConnections(teacherConnections, studentConnections) {
        // 创建连接映射以便快速查找
        const teacherConnectionSet = new Set(
            teacherConnections.map(c => `${c.startId}-${c.endId}`)
        );
        const studentConnectionSet = new Set(
            studentConnections.map(c => `${c.startId}-${c.endId}`)
        );

        // 1. 渲染共同连线（实线）- 学生答对的连线
        teacherConnections.forEach(conn => {
            if (studentConnectionSet.has(`${conn.startId}-${conn.endId}`)) {
                renderLine(conn.startId, conn.endId, 'solid', getLineColor(conn.startId, conn.endId));
            }
        });

        // 2. 渲染教师有但学生没有的连线（虚线）- 学生漏答的连线
        teacherConnections.forEach(conn => {
            if (!studentConnectionSet.has(`${conn.startId}-${conn.endId}`)) {
                renderLine(conn.startId, conn.endId, 'dashed', getLineColor(conn.startId, conn.endId));
            }
        });

        // 3. 渲染学生有但教师没有的连线（灰线）- 学生答错的连线
        studentConnections.forEach(conn => {
            if (!teacherConnectionSet.has(`${conn.startId}-${conn.endId}`)) {
                renderLine(conn.startId, conn.endId, 'solid', '#909399');
            }
        });
    }

    // ==================== 正确连线渲染 ====================
    // 渲染正确的标准答案连线
    function renderCorrectConnections(teacherConnections) {
        teacherConnections.forEach(conn => {
            renderLine(conn.startId, conn.endId, 'solid', getLineColor(conn.startId, conn.endId));
        });
    }

    // ==================== 辅助：获取连线颜色 ====================
    function getLineColor(startId, endId) {
        const startLevel = startId[0].toLowerCase();
        const endLevel = endId[0].toLowerCase();

        if (startLevel === 'a' && endLevel === 'b') return '#409eff';
        if (startLevel === 'b' && endLevel === 'c') return '#67c23a';
        if (startLevel === 'c' && endLevel === 'd') return '#e6a23c';
        if (startLevel === 'd' && endLevel === 'e') return '#f56c6c';

        // 默认颜色
        return '#409eff';
    }

    // ==================== 渲染单条连线 ====================
    function renderLine(startId, endId, style, color) {
        const startPt = document.querySelector(`[data-id="${startId}-start"]`) ||
            document.querySelector(`[data-id="${startId}-end"]`);
        const endPt = document.querySelector(`[data-id="${endId}-end"]`) ||
            document.querySelector(`[data-id="${startId}-start"]`);

        // 确保找到正确的点对
        let actualStart = null, actualEnd = null;

        // 查找正确的起点和终点
        const possibleStartPoints = document.querySelectorAll(`[data-id^="${startId}-"]`);
        const possibleEndPoints = document.querySelectorAll(`[data-id^="${endId}-"]`);

        possibleStartPoints.forEach(s => {
            if (s.classList.contains('start-point')) actualStart = s;
        });

        possibleEndPoints.forEach(e => {
            if (e.classList.contains('end-point')) actualEnd = e;
        });

        if (!actualStart) actualStart = possibleStartPoints[0];
        if (!actualEnd) actualEnd = possibleEndPoints[0];

        if (!actualStart || !actualEnd) return;

        const sCoord = getPointCoord(actualStart);
        const eCoord = getPointCoord(actualEnd);

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', bezier(sCoord.x, sCoord.y, eCoord.x, eCoord.y));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '3');

        if (style === 'dashed') {
            path.setAttribute('stroke-dasharray', '8,4');
        }

        svg.appendChild(path);

        connections.push({
            id: connId++,
            startElement: actualStart,
            endElement: actualEnd,
            element: path
        });
    }

    // ==================== 清除所有连线 ====================
    function clearAllConnections() {
        connections.forEach(conn => {
            if (conn.element && conn.element.parentNode) {
                conn.element.remove();
            }
        });
        connections = [];
    }

    // ==================== 缩放功能 ====================
    function initZoom() {
        // 添加缩放指示器（初始隐藏）
        createZoomIndicator();
        hideZoomIndicator();
    }

    function createZoomIndicator() {
        // 创建缩放控制容器
        const zoomContainer = document.createElement('div');
        zoomContainer.id = 'zoom-control';
        zoomContainer.className = 'zoom-control';

        const containerStyles = `
            position: fixed;
            bottom: 20px;
            left: 20px;
            display: flex;
            align-items: center;
            background: rgba(0,0,0,0.7);
            color: white;
            border-radius: 6px;
            z-index: 9999;
            transition: opacity 0.3s ease;
        `;
        zoomContainer.style.cssText = containerStyles;

        // 减号按钮
        const minusBtn = document.createElement('button');
        minusBtn.id = 'zoom-minus';
        minusBtn.className = 'zoom-btn';
        minusBtn.textContent = '-';
        const btnStyles = `
            background: transparent;
            border: none;
            color: white;
            font-size: 20px;
            cursor: pointer;
            padding: 8px 16px;
            line-height: 1;
        `;
        minusBtn.style.cssText = btnStyles;

        // 缩放数值显示
        const indicator = document.createElement('div');
        indicator.id = 'zoom-indicator';
        indicator.className = 'zoom-indicator';
        indicator.textContent = `${currentZoom}%`;
        const indicatorStyles = `
            padding: 8px 0;
            min-width: 50px;
            text-align: center;
            font-size: 14px;
            border-left: 1px solid rgba(255,255,255,0.2);
            border-right: 1px solid rgba(255,255,255,0.2);
        `;
        indicator.style.cssText = indicatorStyles;

        // 加号按钮
        const plusBtn = document.createElement('button');
        plusBtn.id = 'zoom-plus';
        plusBtn.className = 'zoom-btn';
        plusBtn.textContent = '+';
        plusBtn.style.cssText = btnStyles;

        // 添加事件监听
        minusBtn.addEventListener('click', function () {
            if (currentZoom > 20) {
                setZoom(currentZoom - 10);
            }
        });

        plusBtn.addEventListener('click', function () {
            if (currentZoom < 300) {
                setZoom(currentZoom + 10);
            }
        });

        // 组装
        zoomContainer.appendChild(minusBtn);
        zoomContainer.appendChild(indicator);
        zoomContainer.appendChild(plusBtn);

        document.body.appendChild(zoomContainer);
    }

    function showZoomIndicator() {
        const zoomControl = document.getElementById('zoom-control');
        if (zoomControl) {
            zoomControl.style.opacity = '1';
            zoomControl.style.pointerEvents = 'auto';
        }
    }

    function hideZoomIndicator() {
        const zoomControl = document.getElementById('zoom-control');
        if (zoomControl) {
            zoomControl.style.opacity = '0';
            zoomControl.style.pointerEvents = 'none';
        }
    }

    // 显示/隐藏顶部导航
    function showExploreHeader() {
        const header = document.querySelector('.w_explorehead');
        if (header) {
            header.style.display = 'flex';
        }
    }

    function hideExploreHeader() {
        const header = document.querySelector('.w_explorehead');
        if (header) {
            header.style.display = 'none';
        }
    }

    function handleZoomWheel(e) {
        if (currentMode !== 'drag') return;

        e.preventDefault();

        const delta = e.deltaY > 0 ? -5 : 5;
        let newZoom = currentZoom + delta;

        // 限制范围 20%-300%
        if (newZoom < 20) newZoom = 20;
        if (newZoom > 300) newZoom = 300;

        setZoom(newZoom);
    }

    function setZoom(percent) {
        currentZoom = percent;

        // 应用缩放（与位移结合）
        applyGroupTransform();

        // 更新指示器
        const indicator = document.getElementById('zoom-indicator');
        if (indicator) {
            indicator.textContent = `${currentZoom}%`;
        }

        // 更新连线
        updateAllConnections();
    }

    // 显示/隐藏顶部导航
    function showExploreHeader() {
        const header = document.getElementById('explore-header');
        if (header) {
            header.style.display = 'flex';
        }
    }

    function hideExploreHeader() {
        const header = document.getElementById('explore-header');
        if (header) {
            header.style.display = 'none';
        }
    }

    // ==================== 加载和渲染卡片 ====================
        /**
         * 加载并渲染卡片，初始化连接点及层级连线，最后恢复用户保存的连线状态。
         * 使用 setTimeout 确保 DOM 渲染完成后执行后续初始化逻辑。
         */
        function loadAndRenderCards() {
            renderCards();
           
            setTimeout(() => {
                // 初始化连接点并绘制完整的层级连线，
                initConnectionPoints();
                
                // 加载用户之前保存的连线数据
                loadLs3Connections();
            }, 100);
        }

        /**
         * 根据 ls1 中的 connections 连接关系绘制连线
         * 
         * 该函数从本地存储中获取 ls1 数据，读取其中的 connections 数组，
         * 根据每个连接关系的 startId 和 endId 查找对应的连接点元素，
         * 然后调用 drawDefaultConnection 方法绘制连线。
         * 
         * @returns {void}
         */
        function drawFullHierarchyConnections() {
            const ls1 = JSON.parse(localStorage.getItem('ls1') || '{"connections":[]}');
            const connections = ls1.connections || [];

            connections.forEach(conn => {
                const startPt = document.querySelector(`[data-id="${conn.startId}-start"]`);
                const endPt = document.querySelector(`[data-id="${conn.endId}-end"]`);

                // 确保起始和结束锚点元素存在后，绘制连线
                if (startPt && endPt) {
                    const startLevel = parseInt(conn.startId[1]) || 1;
                    drawDefaultConnection(startPt, endPt, startLevel);
                }
            });
        }

    // 绘制默认连线
    function drawDefaultConnection(startPt, endPt, fromLevel) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'path-line');
        path.setAttribute('stroke-width', '3');
        path.setAttribute('fill', 'none');

        // 根据层级设置渐变色
        let gradientId = `gradient-level-${fromLevel}-to-level-${fromLevel + 1}`;
        path.setAttribute('stroke', `url(#${gradientId})`);

        const sCoord = getPointCoord(startPt);
        const eCoord = getPointCoord(endPt);
        path.setAttribute('d', bezier(sCoord.x, sCoord.y, eCoord.x, eCoord.y));

        svg.appendChild(path);
    }

        /**
         * 根据本地存储中的选中卡片和关系链数据，渲染多层级的卡片视图。
         * 
         *该函数执行以下主要步骤：
         * 1. 清空所有层级容器的现有内容。
         * 2. 从 localStorage 获取选中的卡片 ID (ls2) 和完整层级数据 (fullHierarchyData)。
         * 3. 基于选中卡片和 connections 数据，筛选出所有下级关系链卡片。
         * 4. 隐藏所有层级容器，仅显示包含有效卡片的层级。
         * 5. 遍历需要渲染的层级，调用 renderCard 函数生成具体的卡片元素。
         * 
         * @returns {void} 无返回值
         */
        function renderCards() {
            // 清空所有层级容器
            for (let i = 1; i <= 5; i++) {
                const container = document.getElementById(`golink-level-${i}-cards`);
                if (container) {
                    container.innerHTML = '';
                }
            }
    
            // 从ls2中获取选中的卡片id（通常是第一层级的一个或多个卡片id）
            let selectedCardIds = JSON.parse(localStorage.getItem('ls2') || '[]');
            console.log(selectedCardIds, '选中的卡片id')
            
            // 确保selectedCardIds是一个数组
            if (!Array.isArray(selectedCardIds)) {
                selectedCardIds = ['a1'];
                localStorage.setItem('ls2', JSON.stringify(selectedCardIds));
            }
    
            // 如果没有选中的卡片，不展示数据
            if (selectedCardIds.length === 0) {
                return;
            }
    
            // 从ls1中获取connections数据
            const ls1 = JSON.parse(localStorage.getItem('ls1') || '{}');
            const connections = ls1.connections || [];
            console.log(ls1, 'ls1的连接关系')
    
            // 获取完整层级数据
            let fullData = JSON.parse(localStorage.getItem('fullHierarchyData') || '{}');
    
            // 如果没有完整层级数据，不展示数据
            if (!fullData.level1) {
                return;
            }
    
            // 找出所有需要展示的卡片id
            const cardIdsToShow = new Set(selectedCardIds);
            
            // 递归查找所有下级卡片
            function findAllSubCards(startIds) {
                let foundNew = true;
                while (foundNew) {
                    foundNew = false;
                    // 查找所有以当前卡片为起点的连接
                    const newCards = connections
                        .filter(conn => startIds.includes(conn.startId))
                        .map(conn => conn.endId);
                    
                    // 添加未找到过的卡片
                    newCards.forEach(cardId => {
                        if (!cardIdsToShow.has(cardId)) {
                            cardIdsToShow.add(cardId);
                            startIds.push(cardId);
                            foundNew = true;
                        }
                    });
                }
            }
            
            findAllSubCards([...selectedCardIds]);
            console.log(Array.from(cardIdsToShow), '需要展示的卡片id');
            
            // 首先隐藏所有层级
            for (let i = 1; i <= 5; i++) {
                const levelContainer = document.getElementById(`golink-level-${i}`);
                if (levelContainer) {
                    levelContainer.style.display = 'none';
                }
            }
    
            // 确定最大层级
            let maxLevel = 1;
            cardIdsToShow.forEach(cardId => {
                const level = parseInt(cardId[1]);
                if (level > maxLevel) {
                    maxLevel = level;
                }
            });
    
            // 渲染每个层级
            for (let level = 1; level <= maxLevel; level++) {
                const levelKey = `level${level}`;
                const cardsInLevel = fullData[levelKey] || [];
                
                // 筛选当前层级需要展示的卡片
                const cardsToRender = cardsInLevel.filter(card => cardIdsToShow.has(card.id));
                
                if (cardsToRender.length > 0) {
                    const levelContainer = document.getElementById(`golink-level-${level}`);
                    if (levelContainer) {
                        levelContainer.style.display = '';
                    }
    
                    cardsToRender.forEach(card => {
                        renderCard(card, level, maxLevel);
                    });
                }
            }
        }

    function renderCard(card, level, maxChainLength) {
        const container = document.getElementById(`golink-level-${level}-cards`);
        if (!container) return;

        const isLastLevel = level === maxChainLength;
        const levelClass = `level-${level}`;

        const cardElement = document.createElement('div');
        cardElement.className = `w_contp_item ${levelClass}`;
        cardElement.id = `card-${card.id}`;
        cardElement.setAttribute('data-card-id', card.id);
        cardElement.setAttribute('data-level', level);

        let badge = '';
        if (!isLastLevel) {
            badge = `<div class="w_contp_inum">0</div>`;
        }

        cardElement.innerHTML = `
            <div class="block-header">
                <span class="block-title">${card.title}</span>
            </div>
            <div class="block-content">
                <div class="block-content-text">${card.desc}</div>
                <span class="w_contp_btn golink-more-btn" data-card-id="${card.id}" data-title="${card.title}">详情<i class="fas fa-chevron-right"></i></span>
            </div>
            ${badge}
            ${!isLastLevel ? `<div class="connector-point start-point" data-id="${card.id}-start">0</div>` : ''}
            ${level > 1 ? `<div class="connector-point end-point" data-id="${card.id}-end"></div>` : ''}
        `;

        const moreBtn = cardElement.querySelector('.golink-more-btn');
        if (moreBtn) {
            moreBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                const title = this.getAttribute('data-title');
                const content = this.closest('.w_contp_item').querySelector('.block-content-text').textContent;
                showDetailModal(title, content);
            });
        }

        container.appendChild(cardElement);
    }

    // 获取当前卡片及其所有下级
    function getAllBlocks(currentBlock, data) {
        const allBlocks = [currentBlock];
        const level = parseInt(currentBlock.id[1]);

        // 遍历所有下级层级
        for (let i = level + 1; i <= 5; i++) {
            const levelKey = `level${i}`;
            if (data[levelKey]) {
                allBlocks.push(...data[levelKey]);
            }
        }

        return allBlocks;
    }

    // ==================== 加载 ls3 学生连线数据 ====================
    function loadLs3Connections() {
        try {
            const ls3Data = localStorage.getItem('ls3');
            if (!ls3Data) return;

            const data = JSON.parse(ls3Data);
            if (!data.connections || data.connections.length === 0) return;

            data.connections.forEach(conn => {
                renderStudentConnection(conn.startId, conn.endId);
            });

            updateConnectionCounts();
        } catch (e) {
            console.error('加载 ls3 失败:', e);
        }
    }

    /**
     * 渲染两个学生节点之间的连接线
     * @param {string} startId - 起始节点的ID
     * @param {string} endId - 结束节点的ID
     */
    function renderStudentConnection(startId, endId) {
        // 找到对应的连接点
        const startPt = document.querySelector(`[data-id="${startId}-start"]`);
        const endPt = document.querySelector(`[data-id="${endId}-end"]`);

        if (startPt && endPt) {
            const sCoord = getPointCoord(startPt);
            const eCoord = getPointCoord(endPt);

            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

            // 根据起始节点ID的首字母确定层级，并设置对应的渐变色
            const startLevel = startId[0].toLowerCase();
            let gradientId = '';
            if (startLevel === 'a') gradientId = 'gradient-level-1-to-level-2';
            else if (startLevel === 'b') gradientId = 'gradient-level-2-to-level-3';
            else if (startLevel === 'c') gradientId = 'gradient-level-3-to-level-4';
            else if (startLevel === 'd') gradientId = 'gradient-level-4-to-level-5';

            path.setAttribute('class', 'path-line');
            path.setAttribute('stroke', gradientId ? `url(#${gradientId})` : '#409eff');
            path.setAttribute('d', bezier(sCoord.x, sCoord.y, eCoord.x, eCoord.y));

            svg.appendChild(path);

            // 记录连接信息以便后续管理
            connections.push({
                id: connId++,
                startElement: startPt,
                endElement: endPt,
                element: path
            });

            
        }
    }

    // ==================== 初始化连接点 ====================
    function initConnectionPoints() {
        const startPoints = document.querySelectorAll('.connector-point.start-point');
        const endPoints = document.querySelectorAll('.connector-point.end-point');

        startPoints.forEach(pt => {
            pt.addEventListener('mousedown', startDrag);
            // pt.addEventListener('touchstart', startDrag, { passive: false });
        });

        endPoints.forEach(pt => {
            pt.addEventListener('mouseup', endDrag);
            // pt.addEventListener('touchend', endDrag);
        });

        document.addEventListener('mousemove', onDrag);
        // document.addEventListener('touchmove', onDrag, { passive: false });

        document.addEventListener('mouseup', cancelDrag);
        // document.addEventListener('touchend', cancelDrag);
    }

    // ==================== 拖拽连线功能 ====================
    function startDrag(e) {
        if (currentMode !== 'connect') return;

        e.preventDefault();
        e.stopPropagation();

        curStartPt = e.currentTarget;
        isDraggingConn = true;
        curStartPt.classList.add('dragging');

        const coord = getPointCoord(curStartPt);
        startX = coord.x;
        startY = coord.y;

        tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        const startCard = curStartPt.closest('.w_contp_item');
        const startLevel = parseInt(startCard.getAttribute('data-level'));
        let color = '#409eff';
        if (startLevel === 1) color = '#409eff';
        else if (startLevel === 2) color = '#67c23a';
        else if (startLevel === 3) color = '#e6a23c';
        else if (startLevel === 4) color = '#f56c6c';

        tempPath.setAttribute('fill', 'none');
        tempPath.setAttribute('stroke', '#409eff');
        tempPath.setAttribute('stroke-width', '3');
        tempPath.setAttribute('stroke-dasharray', ''); // 拖拽时使用实线
        svg.appendChild(tempPath);
    }

    function onDrag(e) {
        if (!isDraggingConn || !tempPath || currentMode !== 'connect') return;
        e.preventDefault();

        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        const svgRect = svg.getBoundingClientRect();
        const x = clientX - svgRect.left;
        const y = clientY - svgRect.top;

        tempPath.setAttribute('d', bezier(startX, startY, x, y));

        // 计算拖拽长度
        const dragLength = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
        const thresholdLength = 100;

        // 获取起始卡片的层级
        const startCard = curStartPt.closest('.w_contp_item');
        const startLevel = parseInt(startCard.getAttribute('data-level'));

        // 当拖拽长度超过阈值时，应用渐变色效果
        if (dragLength >= thresholdLength) {
            const progress = Math.min((dragLength - thresholdLength) / 100, 1);

            if (startLevel === 1) {
                // 从蓝色到绿色渐变
                tempPath.style.stroke = `rgb(${(64 - progress * 20)}, ${(158 + progress * 76)}, ${(255 - progress * 200)})`;
            } else if (startLevel === 2) {
                // 从绿色到橙色渐变
                tempPath.style.stroke = `rgb(${(103 + progress * 127)}, ${(194 - progress * 91)}, ${(58 + progress * 100)})`;
            } else if (startLevel === 3) {
                // 从橙色到红色渐变
                tempPath.style.stroke = `rgb(${(230 - progress * 30)}, ${(162 - progress * 60)}, ${(60 + progress * 100)})`;
            } else if (startLevel === 4) {
                // 从红色到紫色渐变
                tempPath.style.stroke = `rgb(${(245 - progress * 45)}, ${(108 + progress * 124)}, ${(108 + progress * 100)})`;
            }
        } else {
            // 未超过阈值时，恢复原始颜色
            let color = '#409eff';
            if (startLevel === 1) color = '#409eff';
            else if (startLevel === 2) color = '#67c23a';
            else if (startLevel === 3) color = '#e6a23c';
            else if (startLevel === 4) color = '#f56c6c';
            tempPath.style.stroke = color;
        }
    }

    function endDrag(e) {
        if (!isDraggingConn || !curStartPt || currentMode !== 'connect') return;
        e.preventDefault();
        e.stopPropagation();

        const endPt = e.currentTarget;

        if (endPt && endPt !== curStartPt) {
            const canConnect = validateConnection(curStartPt, endPt);

            if (canConnect) {
                const exists = connections.some(c =>
                    (c.startElement === curStartPt && c.endElement === endPt) ||
                    (c.startElement === endPt && c.endElement === curStartPt)
                );

                if (!exists) {
                    createConnection(curStartPt, endPt);
                }
            }
        }

        cancelDrag();
    }

    function cancelDrag() {
        if (curStartPt) {
            curStartPt.classList.remove('dragging');
        }
        isDraggingConn = false;
        curStartPt = null;
        if (tempPath) {
            tempPath.remove();
            tempPath = null;
        }
    }

    function validateConnection(startPt, endPt) {
        const startCard = startPt.closest('.w_contp_item');
        const endCard = endPt.closest('.w_contp_item');

        if (!startCard || !endCard) return false;
        if (startCard === endCard) return false;

        const startLevel = parseInt(startCard.getAttribute('data-level'));
        const endLevel = parseInt(endCard.getAttribute('data-level'));

        const isStartToEnd = startPt.classList.contains('start-point') && endPt.classList.contains('end-point');
        const isEndToStart = startPt.classList.contains('end-point') && endPt.classList.contains('start-point');

        const isValidDirection = isStartToEnd || isEndToStart;

        const isValidLevel = Math.abs(startLevel - endLevel) === 1;

        return isValidDirection && isValidLevel;
    }

    function createConnection(startPt, endPt) {
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'path-line');
        path.setAttribute('stroke-width', '3');
        path.setAttribute('fill', 'none');

        const startCard = startPt.closest('.w_contp_item');
        const endCard = endPt.closest('.w_contp_item');
        const startLevel = parseInt(startCard.getAttribute('data-level'));
        const endLevel = parseInt(endCard.getAttribute('data-level'));

        // 根据层级设置渐变色
        let gradientId = '';
        if (startLevel === 1 && endLevel === 2) gradientId = 'gradient-level-1-to-level-2';
        else if (startLevel === 2 && endLevel === 3) gradientId = 'gradient-level-2-to-level-3';
        else if (startLevel === 3 && endLevel === 4) gradientId = 'gradient-level-3-to-level-4';
        else if (startLevel === 4 && endLevel === 5) gradientId = 'gradient-level-4-to-level-5';

        // 如果是反向连接，使用相反的渐变色
        if (startLevel === 2 && endLevel === 1) gradientId = 'gradient-level-1-to-level-2';
        else if (startLevel === 3 && endLevel === 2) gradientId = 'gradient-level-2-to-level-3';
        else if (startLevel === 4 && endLevel === 3) gradientId = 'gradient-level-3-to-level-4';
        else if (startLevel === 5 && endLevel === 4) gradientId = 'gradient-level-4-to-level-5';

        path.setAttribute('stroke', gradientId ? `url(#${gradientId})` : '#409eff');

        let actualStart = startPt;
        let actualEnd = endPt;

        if (startLevel > endLevel) {
            if (startPt.classList.contains('end-point') && endPt.classList.contains('start-point')) {
                actualStart = endPt;
                actualEnd = startPt;
            }
        }

        const sCoord = getPointCoord(actualStart);
        const eCoord = getPointCoord(actualEnd);
        path.setAttribute('d', bezier(sCoord.x, sCoord.y, eCoord.x, eCoord.y));

        const connection = {
            id: connId++,
            startElement: actualStart,
            endElement: actualEnd,
            element: path
        };

        connections.push(connection);

        

        svg.appendChild(path);

        updateAllConnections();
        updateConnectionCounts(); 
    }

 

    // ==================== 保存到 ls3 ====================
    function saveLs3Connections() {
        try {
            const ls3Data = {
                connections: connections.map(c => ({
                    startId: c.startElement.getAttribute('data-id').replace('-start', '').replace('-end', ''),
                    endId: c.endElement.getAttribute('data-id').replace('-start', '').replace('-end', '')
                })),
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('ls3', JSON.stringify(ls3Data));
            console.log('学生连线已保存到 ls3');

            // 同时保存探索进度
            saveExploreProgress();
        } catch (e) {
            console.error('保存 ls3 失败:', e);
        }
    }

    // ==================== 保存探索进度 ====================
    function saveExploreProgress() {
        try {
            // 获取选中的卡片 id（ls2）
            const ls2 = JSON.parse(localStorage.getItem('ls2') || '[]');
            if (ls2.length === 0) return;

            // 获取标准答案（ls1）
            const ls1 = JSON.parse(localStorage.getItem('ls1') || '{"connections":[]}');
            const teacherConnections = ls1.connections || [];

            // 获取该次探索的所有相关标准答案连接
            const selectedCardIds = ls2;
            const relevantTeacherConnections = getRelevantConnections(selectedCardIds, teacherConnections);

            // 获取学生已完成的连接
            const studentConnections = connections.map(c => ({
                startId: c.startElement.getAttribute('data-id').replace('-start', '').replace('-end', ''),
                endId: c.endElement.getAttribute('data-id').replace('-start', '').replace('-end', '')
            }));

            // 计算完成的进度
            let correctCount = 0;
            studentConnections.forEach(sc => {
                const isCorrect = relevantTeacherConnections.some(tc => 
                    tc.startId === sc.startId && tc.endId === sc.endId
                );
                if (isCorrect) correctCount++;
            });

            const totalCount = relevantTeacherConnections.length;
            const progressPercentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
            const isCompleted = totalCount > 0 && correctCount >= totalCount;

            // 保存进度
            const exploreProgress = JSON.parse(localStorage.getItem('exploreProgress') || '{}');
            
            // 为每个选中的卡片保存进度（可以是多个）
            selectedCardIds.forEach(cardId => {
                exploreProgress[cardId] = {
                    progress: progressPercentage,
                    isCompleted: isCompleted,
                    completedAt: isCompleted ? new Date().toISOString() : null,
                    lastUpdated: new Date().toISOString(),
                    totalConnections: totalCount,
                    completedConnections: correctCount
                };
            });

            localStorage.setItem('exploreProgress', JSON.stringify(exploreProgress));
            console.log('探索进度已保存', exploreProgress);
        } catch (e) {
            console.error('保存探索进度失败:', e);
        }
    }

    // ==================== 获取相关连接 ====================
    function getRelevantConnections(startCardIds, allConnections) {
        const relevantConnections = [];
        const processedIds = new Set(startCardIds);
        let currentIds = [...startCardIds];

        while (currentIds.length > 0) {
            const nextIds = [];
            allConnections.forEach(conn => {
                if (currentIds.includes(conn.startId) && !processedIds.has(conn.endId)) {
                    relevantConnections.push(conn);
                    processedIds.add(conn.endId);
                    nextIds.push(conn.endId);
                }
            });
            currentIds = nextIds;
        }

        return relevantConnections;
    }

    // ==================== 连线更新和坐标计算 ====================
    function updateAllConnections() {
        connections.forEach(c => {
            const s = getPointCoord(c.startElement);
            const e = getPointCoord(c.endElement);
            c.element.setAttribute('d', bezier(s.x, s.y, e.x, e.y));
        });
    }

    function getPointCoord(pt) {
        const svgRect = svg.getBoundingClientRect();
        const ptRect = pt.getBoundingClientRect();
        return {
            x: ptRect.left + ptRect.width / 2 - svgRect.left,
            y: ptRect.top + ptRect.height / 2 - svgRect.top
        };
    }

    function bezier(x1, y1, x2, y2) {
        const cx = (x1 + x2) / 2;
        return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
    }

        /**
         * 更新所有连接点的连接数量显示。
         * 
         * 该函数遍历所有连接关系，统计每个卡片（通过 data-id 标识）参与的连接总数，
         * 并将统计结果更新到页面上对应的徽章元素和连接器点元素中。
         */
        function updateConnectionCounts() {
            const countMap = new Map();
    
            // 遍历所有连接，统计每个起始和结束元素的连接次数
            connections.forEach(c => {
                const startId = c.startElement.getAttribute('data-id').replace('-start', '').replace('-end', '');
                // const endId = c.endElement.getAttribute('data-id').replace('-start', '').replace('-end', '');
    
                countMap.set(startId, (countMap.get(startId) || 0) + 1);
                // countMap.set(endId, (countMap.get(endId) || 0) + 1);
            });
            
            // 更新卡片右上角的连接数徽章显示
            document.querySelectorAll('.w_contp_inum').forEach(badge => {
                const card = badge.closest('.w_contp_item');
                const cardId = card ? card.getAttribute('data-card-id') : '';
                const count = countMap.get(cardId) || 0;
                badge.textContent = count;
            });
    
            for (let level = 1; level <= 5; level++) {
                document.querySelectorAll(`#golink-level-${level} .w_contp_item .connector-point.start-point`).forEach(connector => {
                    const cardId = connector.getAttribute('data-id').replace('-start', '');
                    const count = countMap.get(cardId) || 0;
                    connector.textContent = count;
                });
            }
        }

    // ==================== 弹窗功能 ====================
    // 初始化详情弹窗事件
    function initModal() {
        const overlay = document.getElementById('golink-modal-overlay');
        const closeBtn = document.getElementById('golink-modal-close');

        closeBtn.addEventListener('click', hideModal); // 点击关闭按钮
        overlay.addEventListener('click', hideModal); // 点击遮罩层
        // ESC 键关闭弹窗
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') hideModal();
        });
    }

    // 显示详情弹窗
    function showDetailModal(title, desc) {
        const titleEl = document.getElementById('golink-modal-title');
        const descEl = document.getElementById('golink-modal-desc');
        const modal = document.getElementById('golink-detail-modal');

        titleEl.textContent = title;
        // 使用 textContent 确保内容安全，防止 XSS
        descEl.textContent = desc;

        modal.classList.add('show'); // 显示弹窗
        document.body.style.overflow = 'hidden'; // 禁止页面滚动

        // 滚动到顶部，确保从开头查看内容
        const content = modal.querySelector('.golink-modal-content');
        if (content) {
            content.scrollTop = 0;
        }
    }

    // 隐藏详情弹窗
    function hideModal() {
        const modal = document.getElementById('golink-detail-modal');
        modal.classList.remove('show'); // 隐藏弹窗
        document.body.style.overflow = ''; // 恢复页面滚动
    }

    window.addEventListener('resize', () => {
        updateAllConnections();
    });

})();
