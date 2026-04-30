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
    let connections = [];
    let connId = 0;
    let isDraggingConn = false;
    let startX, startY, curStartPt = null, tempPath = null;

    let svgConnectorPoints = new Map();
    let connectorGroup = null;

    const LEVEL_COLORS = {
        a: '#409eff', b: '#67c23a', c: '#e6a23c', d: '#f56c6c', e: '#E372DB'
    };

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
 

    function renderCompareView() {
        clearAllConnections();
        updateSvgConnectorPositions();

        const ls1 = JSON.parse(localStorage.getItem('ls1') || '{"connections":[]}');
        const ls3 = JSON.parse(localStorage.getItem('ls3') || '{"connections":[]}');

        renderCompareConnections(ls1.connections, ls3.connections);
    }

    function renderDragView() {
        clearAllConnections();
        updateSvgConnectorPositions();

        const ls1 = JSON.parse(localStorage.getItem('ls1') || '{"connections":[]}');

        renderCorrectConnections(ls1.connections);

        showZoomIndicator();

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

    function renderLine(startId, endId, style, color) {
        var startInfo = svgConnectorPoints.get(startId + '-start');
        var endInfo = svgConnectorPoints.get(endId + '-end');

        if (!startInfo || !endInfo) return;

        var startElement = startInfo.element;
        var endElement = endInfo.element;

        var startTransform = startElement.getAttribute('transform');
        var startMatch = startTransform && startTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!startMatch) return;
        var sx = parseFloat(startMatch[1]);
        var sy = parseFloat(startMatch[2]);

        var endTransform = endElement.getAttribute('transform');
        var endMatch = endTransform && endTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!endMatch) return;
        var ex = parseFloat(endMatch[1]);
        var ey = parseFloat(endMatch[2]);

        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', bezier(sx, sy, ex, ey));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', color);
        path.setAttribute('stroke-width', '2.5');

        if (style === 'dashed') {
            path.setAttribute('stroke-dasharray', '8,4');
        }

        svg.insertBefore(path, connectorGroup);

        connections.push({
            id: connId++,
            startElement: startElement,
            endElement: endElement,
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
                initConnectionPoints();
                loadLs3Connections();
                updateBadges();
            }, 100);
        }

        function drawFullHierarchyConnections() {
            const ls1 = JSON.parse(localStorage.getItem('ls1') || '{"connections":[]}');
            const connections = ls1.connections || [];

            connections.forEach(conn => {
                const startInfo = svgConnectorPoints.get(conn.startId + '-start');
                const endInfo = svgConnectorPoints.get(conn.endId + '-end');

                if (startInfo && endInfo) {
                    drawDefaultConnection(startInfo.element, endInfo.element, conn.startId);
                }
            });
        }

    function drawDefaultConnection(startPt, endPt, startBlockId) {
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'path-line');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('fill', 'none');

        var startTransform = startPt.getAttribute('transform');
        var startMatch = startTransform && startTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!startMatch) return;
        var sx = parseFloat(startMatch[1]);
        var sy = parseFloat(startMatch[2]);

        var endTransform = endPt.getAttribute('transform');
        var endMatch = endTransform && endTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!endMatch) return;
        var ex = parseFloat(endMatch[1]);
        var ey = parseFloat(endMatch[2]);

        var startLevelKey = startBlockId[0].toLowerCase();
        var endBlockId = endPt.getAttribute('data-block-id') || '';
        var endLevelKey = endBlockId ? endBlockId[0].toLowerCase() : String.fromCharCode(startLevelKey.charCodeAt(0) + 1);
        var levelColors = { a: '#409eff', b: '#67c23a', c: '#e6a23c', d: '#f56c6c', e: '#E372DB' };
        var c1 = levelColors[startLevelKey] || '#409eff';
        var c2 = levelColors[endLevelKey] || '#67c23a';

        var gradientId = 'grad-' + startBlockId + '-' + (endBlockId || 'end') + '-' + Date.now();
        var lg = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        lg.setAttribute('id', gradientId);
        lg.setAttribute('gradientUnits', 'userSpaceOnUse');
        lg.setAttribute('x1', String(sx));
        lg.setAttribute('y1', String(sy));
        lg.setAttribute('x2', String(ex));
        lg.setAttribute('y2', String(ey));
        var s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s1.setAttribute('offset', '0%');
        s1.setAttribute('stop-color', c1);
        var s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s2.setAttribute('offset', '100%');
        s2.setAttribute('stop-color', c2);
        lg.appendChild(s1);
        lg.appendChild(s2);

        var defs = svg.querySelector('defs');
        if (defs) defs.appendChild(lg);

        path.style.stroke = 'url(#' + gradientId + ')';
        path.setAttribute('d', bezier(sx, sy, ex, ey));

        svg.insertBefore(path, connectorGroup);
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

        const isFirstLevel = level === 1;
        const isLastLevel = level === maxChainLength;
        const levelClass = `level-${level}`;

        const cardElement = document.createElement('div');
        cardElement.className = `w_contp_item ${levelClass}`;
        cardElement.id = `card-${card.id}`;
        cardElement.setAttribute('data-card-id', card.id);
        cardElement.setAttribute('data-level', level);

        let badge = '';
        if (!isFirstLevel && !isLastLevel) {
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
            <div class="block-action-row">
                <div class="w_contp_ibtn"></div>
                <div class="block-actions">
                    <span class="action-btn edit-btn" title="编辑">
                        <div class="xcustomSvg">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M3.11727 11.8925L11.0722 3.9375L13.4587 6.32399L5.50376 14.2789L2.9913 15.1164C2.55156 15.263 2.13321 14.8446 2.27978 14.4049L3.11727 11.8925Z" fill="#606266"></path>
                                <path d="M11.8677 3.142L12.2655 2.74426C12.9245 2.08525 13.9929 2.08525 14.652 2.74426C15.311 3.40327 15.311 4.47173 14.652 5.13074L14.2542 5.52849L11.8677 3.142Z" fill="#606266"></path>
                                <path d="M10.4474 13.926H9.09744V15.276H10.4474V13.926Z" fill="#606266"></path>
                                <path d="M13.3725 13.926H12.0225V15.276H13.3725V13.926Z" fill="#606266"></path>
                                <path d="M14.9469 13.926H16.2969V15.276H14.9469V13.926Z" fill="#606266"></path>
                            </svg>
                        </div>
                    </span>
                    <span class="action-btn connect-btn" title="关联子级">
                        <div class="xcustomSvg">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4.125 5.8913C5.20931 5.56859 6 4.56413 6 3.375C6 1.92525 4.82475 0.75 3.375 0.75C1.92525 0.75 0.75 1.92525 0.75 3.375C0.75 4.56413 1.54069 5.56859 2.625 5.8913V8.52692C2.625 9.14824 3.12868 9.65192 3.75 9.65192H6.58347C6.98319 10.5913 7.91467 11.25 9 11.25C10.0853 11.25 11.0168 10.5913 11.4165 9.65192H13.875V12.1087C12.7907 12.4314 12 13.4359 12 14.625C12 16.0747 13.1753 17.25 14.625 17.25C16.0747 17.25 17.25 16.0747 17.25 14.625C17.25 13.4359 16.4593 12.4314 15.375 12.1087V9.27692C15.375 8.6556 14.8713 8.15192 14.25 8.15192H11.5825C11.3597 6.92797 10.2882 6 9 6C7.71177 6 6.64027 6.92797 6.41752 8.15192H4.125V5.8913Z" fill="#606266"></path>
                            </svg>
                        </div>
                    </span>
                    <span class="action-btn delete-btn" title="删除卡片">
                        <div class="xcustomSvg">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4.875 3.00049C4.875 1.75785 5.88236 0.750488 7.125 0.750488H10.875C12.1176 0.750488 13.125 1.75785 13.125 3.00049V3.93799H16.125C16.5392 3.93799 16.875 4.27377 16.875 4.68799C16.875 5.1022 16.5392 5.43799 16.125 5.43799H1.875C1.46079 5.43799 1.125 5.1022 1.125 4.68799C1.125 4.27377 1.46079 3.93799 1.875 3.93799H4.875V3.00049ZM11.625 3.75049V3.00049C11.625 2.58627 11.2892 2.25049 10.875 2.25049H7.125C6.71079 2.25049 6.375 2.58627 6.375 3.00049V3.75049H11.625ZM4.125 6.00049C4.53921 6.00049 4.875 6.33627 4.875 6.75049V14.6255C4.875 15.0397 5.21079 15.3755 5.625 15.3755H12.375C12.7892 15.3755 13.125 15.0397 13.125 14.6255V6.75049C13.125 6.33627 13.4608 6.00049 13.875 6.00049C14.2892 6.00049 14.625 6.33627 14.625 6.75049V14.6255C14.625 15.8681 13.6176 16.8755 12.375 16.8755H5.625C4.38236 16.8755 3.375 15.8681 3.375 14.6255V6.75049C3.375 6.33627 3.71079 6.00049 4.125 6.00049ZM7.5 6.75049C7.91421 6.75049 8.25 7.08627 8.25 7.50049V12.7505C8.25 13.1647 7.91421 13.5005 7.5 13.5005C7.08579 13.5005 6.75 13.1647 6.75 12.7505V7.50049C6.75 7.08627 7.08579 6.75049 7.5 6.75049ZM10.5 6.75049C10.9142 6.75049 11.25 7.08627 11.25 7.50049V12.7505C11.25 13.1647 10.9142 13.5005 10.5 13.5005C10.0858 13.5005 9.75 13.1647 9.75 12.7505V7.50049C9.75 7.08627 10.0858 6.75049 10.5 6.75049Z" fill="#606266"></path>
                            </svg>
                        </div>
                    </span>
                </div>
            </div>
            ${badge}
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

    function renderStudentConnection(startId, endId) {
        var startPt = svgConnectorPoints.get(startId + '-start');
        var endPt = svgConnectorPoints.get(endId + '-end');

        if (!startPt || !endPt) return;

        var startElement = startPt.element;
        var endElement = endPt.element;

        var startTransform = startElement.getAttribute('transform');
        var startMatch = startTransform && startTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!startMatch) return;
        var sx = parseFloat(startMatch[1]);
        var sy = parseFloat(startMatch[2]);

        var endTransform = endElement.getAttribute('transform');
        var endMatch = endTransform && endTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!endMatch) return;
        var ex = parseFloat(endMatch[1]);
        var ey = parseFloat(endMatch[2]);

        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'path-line');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('fill', 'none');

        var startLevelKey = startId[0].toLowerCase();
        var endLevelKey = endId[0].toLowerCase();
        var levelColors = { a: '#409eff', b: '#67c23a', c: '#e6a23c', d: '#f56c6c', e: '#E372DB' };
        var c1 = levelColors[startLevelKey] || '#409eff';
        var c2 = levelColors[endLevelKey] || '#67c23a';

        var gradientId = 'grad-' + startId + '-' + endId + '-' + Date.now();
        var lg = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        lg.setAttribute('id', gradientId);
        lg.setAttribute('gradientUnits', 'userSpaceOnUse');
        lg.setAttribute('x1', String(sx));
        lg.setAttribute('y1', String(sy));
        lg.setAttribute('x2', String(ex));
        lg.setAttribute('y2', String(ey));
        var s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s1.setAttribute('offset', '0%');
        s1.setAttribute('stop-color', c1);
        var s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s2.setAttribute('offset', '100%');
        s2.setAttribute('stop-color', c2);
        lg.appendChild(s1);
        lg.appendChild(s2);

        var defs = svg.querySelector('defs');
        if (defs) defs.appendChild(lg);

        path.style.stroke = 'url(#' + gradientId + ')';
        path.setAttribute('d', bezier(sx, sy, ex, ey));

        svg.insertBefore(path, connectorGroup);

        connections.push({
            id: connId++,
            startElement: startElement,
            endElement: endElement,
            element: path
        });
    }

    function initConnectionPoints() {
        svg.innerHTML = '';

        const svgNS = 'http://www.w3.org/2000/svg';

        const defs = document.createElementNS(svgNS, 'defs');
        svg.appendChild(defs);

        var linesGroup = document.createElementNS(svgNS, 'g');
        linesGroup.setAttribute('class', 'svg-lines-group');
        svg.appendChild(linesGroup);

        connectorGroup = document.createElementNS(svgNS, 'g');
        connectorGroup.setAttribute('id', 'connector-points-group');
        svg.appendChild(connectorGroup);

        svgConnectorPoints.clear();

        var allCards = document.querySelectorAll('.w_contp_item');
        var maxLevel = 0;
        allCards.forEach(function (card) {
            var m = card.className.match(/level-(\d+)/);
            if (m) maxLevel = Math.max(maxLevel, parseInt(m[1], 10));
        });

        allCards.forEach(function (card) {
            var cardId = card.getAttribute('data-card-id');
            if (!cardId) return;
            var levelMatch = card.className.match(/level-(\d+)/);
            var level = levelMatch ? parseInt(levelMatch[1], 10) : 1;
            var isFirstLevel = level === 1;
            var isLastLevel = level === maxLevel;

            if (!isLastLevel) {
                createSvgConnectorPoint(card, 'start', cardId);
            }
            if (!isFirstLevel) {
                createSvgConnectorPoint(card, 'end', cardId);
            }
        });

        updateSvgConnectorPositions();

        connectorGroup.addEventListener('mousedown', onSvgPointDown);
        connectorGroup.addEventListener('mouseup', endDrag);
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', cancelDrag);
    }

    function createSvgConnectorPoint(block, type, blockId) {
        var svgNS = 'http://www.w3.org/2000/svg';
        var dataId = blockId + '-' + type;
        var levelKey = blockId[0].toLowerCase();
        var color = LEVEL_COLORS[levelKey] || '#409eff';
        var radius = blockId.startsWith('a') ? 10 : 8;

        var g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'svg-connector-point svg-' + type + '-point');
        g.setAttribute('data-id', dataId);
        g.setAttribute('data-block-id', blockId);
        g.style.cursor = 'crosshair';
        g.style.pointerEvents = 'all';

        var outerCircle = document.createElementNS(svgNS, 'circle');
        outerCircle.setAttribute('r', String(radius));
        outerCircle.setAttribute('fill', type === 'start' && blockId.startsWith('a') ? color : '#fff');
        outerCircle.setAttribute('stroke', color);
        outerCircle.setAttribute('stroke-width', '2');
        outerCircle.setAttribute('class', 'svg-connector-outer');
        g.appendChild(outerCircle);

        if (type === 'start' && blockId.startsWith('a')) {
            var text = document.createElementNS(svgNS, 'text');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'central');
            text.setAttribute('fill', '#fff');
            text.setAttribute('font-size', '10');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('class', 'svg-connector-badge-text');
            text.textContent = '0';
            g.appendChild(text);
        }

        connectorGroup.appendChild(g);

        svgConnectorPoints.set(dataId, {
            element: g,
            outerCircle: outerCircle,
            block: block,
            type: type,
            dataId: dataId
        });
    }

    function updateSvgConnectorPositions() {
        var svgRect = svg.getBoundingClientRect();

        svgConnectorPoints.forEach(function (info) {
            var element = info.element;
            var block = info.block;
            var type = info.type;

            if (!block || !block.offsetParent) {
                element.style.display = 'none';
                return;
            }

            element.style.display = '';

            var blockRect = block.getBoundingClientRect();
            var cx, cy;

            if (type === 'start') {
                cx = blockRect.right - svgRect.left;
                cy = blockRect.top + blockRect.height / 2 - svgRect.top;
            } else {
                cx = blockRect.left - svgRect.left;
                cy = blockRect.top + blockRect.height / 2 - svgRect.top;
            }

            element.setAttribute('transform', 'translate(' + cx + ',' + cy + ')');
        });
    }

    function updateBadges() {
        var map = new Map();
        svgConnectorPoints.forEach(function (info) {
            if (info.type === 'start') {
                map.set(info.dataId, 0);
            }
        });
        connections.forEach(function (c) {
            var sDataId = c.startElement.getAttribute('data-id');
            if (sDataId && map.has(sDataId)) {
                map.set(sDataId, map.get(sDataId) + 1);
            }
        });
        map.forEach(function (cnt, dataId) {
            var info = svgConnectorPoints.get(dataId);
            if (!info) return;
            var block = info.block;
            if (block && block.getAttribute('data-card-id') && block.getAttribute('data-card-id').startsWith('a')) {
                var textEl = info.element.querySelector('.svg-connector-badge-text');
                if (textEl) textEl.textContent = cnt;
            } else if (block) {
                var badge = block.querySelector('.w_contp_inum');
                if (badge) badge.textContent = cnt;
            }
        });
    }

    function onSvgPointDown(e) {
        if (currentMode !== 'connect') return;

        var target = e.target.closest('.svg-connector-point');
        if (!target) return;

        var dataId = target.getAttribute('data-id');
        if (!dataId || !dataId.endsWith('-start')) return;

        e.preventDefault();
        e.stopPropagation();

        curStartPt = target;
        isDraggingConn = true;
        curStartPt.classList.add('dragging');

        var transform = curStartPt.getAttribute('transform');
        var match = transform && transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!match) return;
        startX = parseFloat(match[1]);
        startY = parseFloat(match[2]);

        tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        tempPath.setAttribute('fill', 'none');
        tempPath.setAttribute('stroke', '#409eff');
        tempPath.setAttribute('stroke-width', '3');
        svg.insertBefore(tempPath, connectorGroup);
    }

    function onDrag(e) {
        if (!isDraggingConn || !tempPath || currentMode !== 'connect') return;
        e.preventDefault();

        var svgRect = svg.getBoundingClientRect();
        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;
        var x = clientX - svgRect.left;
        var y = clientY - svgRect.top;

        tempPath.setAttribute('d', bezier(startX, startY, x, y));

        var dragLength = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
        var thresholdLength = 100;

        var startBlockId = curStartPt.getAttribute('data-block-id') || '';
        var startLevelKey = startBlockId[0].toLowerCase();

        if (dragLength >= thresholdLength) {
            var progress = Math.min((dragLength - thresholdLength) / 100, 1);
            var startColor = LEVEL_COLORS[startLevelKey] || '#409eff';
            var nextLevelKey = String.fromCharCode(startLevelKey.charCodeAt(0) + 1);
            var endColor = LEVEL_COLORS[nextLevelKey] || startColor;
            var r = Math.round(parseInt(startColor.slice(1, 3), 16) * (1 - progress) + parseInt(endColor.slice(1, 3), 16) * progress);
            var g = Math.round(parseInt(startColor.slice(3, 5), 16) * (1 - progress) + parseInt(endColor.slice(3, 5), 16) * progress);
            var b = Math.round(parseInt(startColor.slice(5, 7), 16) * (1 - progress) + parseInt(endColor.slice(5, 7), 16) * progress);
            tempPath.style.stroke = `rgb(${r}, ${g}, ${b})`;
        } else {
            tempPath.style.stroke = LEVEL_COLORS[startLevelKey] || '#409eff';
        }
    }

    function endDrag(e) {
        if (!isDraggingConn || !curStartPt || currentMode !== 'connect') return;
        e.preventDefault();
        e.stopPropagation();

        var target = e.target.closest('.svg-connector-point');

        if (target && target !== curStartPt) {
            var canConnect = validateConnection(curStartPt, target);

            if (canConnect) {
                var exists = connections.some(c =>
                    (c.startElement === curStartPt && c.endElement === target) ||
                    (c.startElement === target && c.endElement === curStartPt)
                );

                if (!exists) {
                    createConnection(curStartPt, target);
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
        var startBlockId = startPt.getAttribute('data-block-id') || '';
        var endBlockId = endPt.getAttribute('data-block-id') || '';

        if (!startBlockId || !endBlockId) return false;
        if (startBlockId === endBlockId) return false;

        var startDataId = startPt.getAttribute('data-id') || '';
        var endDataId = endPt.getAttribute('data-id') || '';

        var isStartToEnd = startDataId.endsWith('-start') && endDataId.endsWith('-end');
        if (!isStartToEnd) return false;

        var startLevelKey = startBlockId[0].toLowerCase();
        var endLevelKey = endBlockId[0].toLowerCase();
        var diff = Math.abs(startLevelKey.charCodeAt(0) - endLevelKey.charCodeAt(0));

        return diff === 1;
    }

    function createConnection(startPt, endPt) {
        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'path-line');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('fill', 'none');

        var startBlockId = startPt.getAttribute('data-block-id') || '';
        var endBlockId = endPt.getAttribute('data-block-id') || '';

        var startTransform = startPt.getAttribute('transform');
        var startMatch = startTransform && startTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!startMatch) return;
        var startX = parseFloat(startMatch[1]);
        var startY = parseFloat(startMatch[2]);

        var endTransform = endPt.getAttribute('transform');
        var endMatch = endTransform && endTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!endMatch) return;
        var endX = parseFloat(endMatch[1]);
        var endY = parseFloat(endMatch[2]);

        var startLevelKey = startBlockId[0].toLowerCase();
        var endLevelKey = endBlockId[0].toLowerCase();
        var levelColors = { a: '#409eff', b: '#67c23a', c: '#e6a23c', d: '#f56c6c', e: '#E372DB' };
        var c1 = levelColors[startLevelKey] || '#409eff';
        var c2 = levelColors[endLevelKey] || '#67c23a';

        var gradientId = 'grad-' + startBlockId + '-' + endBlockId + '-' + Date.now();
        var lg = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        lg.setAttribute('id', gradientId);
        lg.setAttribute('gradientUnits', 'userSpaceOnUse');
        lg.setAttribute('x1', String(startX));
        lg.setAttribute('y1', String(startY));
        lg.setAttribute('x2', String(endX));
        lg.setAttribute('y2', String(endY));
        var s1 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s1.setAttribute('offset', '0%');
        s1.setAttribute('stop-color', c1);
        var s2 = document.createElementNS('http://www.w3.org/2000/svg', 'stop');
        s2.setAttribute('offset', '100%');
        s2.setAttribute('stop-color', c2);
        lg.appendChild(s1);
        lg.appendChild(s2);

        var defs = svg.querySelector('defs');
        if (defs) defs.appendChild(lg);

        path.style.stroke = 'url(#' + gradientId + ')';
        path.setAttribute('d', bezier(startX, startY, endX, endY));

        var connection = {
            id: connId++,
            startElement: startPt,
            endElement: endPt,
            element: path
        };

        connections.push(connection);

        svg.insertBefore(path, connectorGroup);

        updateBadges();
    }

 

    function saveLs3Connections() {
        try {
            const ls3Data = {
                connections: connections.map(c => ({
                    startId: c.startElement.getAttribute('data-block-id'),
                    endId: c.endElement.getAttribute('data-block-id')
                })),
                timestamp: new Date().toISOString()
            };
            localStorage.setItem('ls3', JSON.stringify(ls3Data));

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
                startId: c.startElement.getAttribute('data-block-id'),
                endId: c.endElement.getAttribute('data-block-id')
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
        updateSvgConnectorPositions();
        connections.forEach(c => {
            var startTransform = c.startElement.getAttribute('transform');
            var startMatch = startTransform && startTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
            if (!startMatch) return;
            var sx = parseFloat(startMatch[1]);
            var sy = parseFloat(startMatch[2]);

            var endTransform = c.endElement.getAttribute('transform');
            var endMatch = endTransform && endTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
            if (!endMatch) return;
            var ex = parseFloat(endMatch[1]);
            var ey = parseFloat(endMatch[2]);

            c.element.setAttribute('d', bezier(sx, sy, ex, ey));
        });
    }

    function bezier(x1, y1, x2, y2) {
        const cx = (x1 + x2) / 2;
        return `M ${x1} ${y1} C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
    }

        function updateConnectionCounts() {
            updateBadges();
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
