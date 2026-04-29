// questionMapDetail 页面核心功能
(function () {
    'use strict';

    // ==================== DOM 元素获取 ====================
    const mapContainer = document.getElementById('golink-workspace');
    const contentContainer = document.getElementById('content-container');
    const svg = document.getElementById('golink-connections-svg');
    const backBtn = document.getElementById('back-btn');
    const zoomMinusBtn = document.getElementById('zoom-minus');
    const zoomPlusBtn = document.getElementById('zoom-plus');
    const zoomLevel = document.getElementById('zoom-level');
    const detailModal = document.getElementById('detail-modal-overlay');
    const detailModalTitle = document.getElementById('detail-modal-title');
    const detailModalContent = document.getElementById('detail-modal-content');
    const detailModalClose = document.getElementById('detail-modal-close');
    const editModal = document.getElementById('edit-block-modal-overlay');
    const editModalClose = document.getElementById('edit-block-modal-close');
    const editModalCancel = document.getElementById('edit-block-btn-cancel');
    const editModalConfirm = document.getElementById('edit-block-btn-confirm');
    const editBlockNameInput = document.getElementById('edit-block-name');
    const editBlockDesc = document.getElementById('edit-block-desc');
    const editBlockTeacher = document.getElementById('edit-block-teacher');

    // ==================== 核心状态变量 ====================
    let currentZoom = 100; // 缩放等级，百分比
    let dragActive = false; // 是否激活拖拽
    let dragStartX = 0; // 拖拽起始 X 坐标
    let dragStartY = 0; // 拖拽起始 Y 坐标
    let groupOffsetX = 0; // 卡片组整体 X 偏移
    let groupOffsetY = 0; // 卡片组整体 Y 偏移
    let currentBlockId = null; // 当前卡片 ID
    let connections = []; // 连接数据
    let connectionCountMap = new Map(); // 连接数映射
    let currentEditingBlock = null; // 当前编辑的卡片

    // ==================== 初始化 ====================
    document.addEventListener('DOMContentLoaded', function () {
        // 检查是否有关系链数据
        const relationChain = localStorage.getItem('relationChain');
        console.log('relationChain:', relationChain);
        if (relationChain) {
            // 展示关系链卡片
            showRelationChain(JSON.parse(relationChain));
        } else {
            // 获取当前点击的卡片ID
            currentBlockId = localStorage.getItem('currentBlockId');
            if (!currentBlockId) {
                // 没有卡片ID，返回首页
                window.location.href = 'index.html';
                return;
            }

            // 加载卡片数据
            loadBlockData();
        }

        // 初始化按钮事件
        initButtons();

        // 初始化缩放功能
        initZoom();

        // 初始化拖拽功能
        initDrag();

        // 初始化弹窗
        initModal();
    });

    // ==================== 加载卡片数据 ====================
    function loadBlockData() {
        try {
            // 从 localStorage 获取完整层级数据
            const fullData = localStorage.getItem('fullHierarchyData');
            if (fullData) {
                const data = JSON.parse(fullData);
                // 查找当前卡片
                const currentBlock = findBlockById(data, currentBlockId);
                if (currentBlock) {
                    // 获取当前卡片及其所有下级
                    const allBlocks = getAllBlocks(currentBlock, data);
                    // 渲染卡片
                    renderBlocks(allBlocks);
                } else {
                    console.error('未找到当前卡片:', currentBlockId);
                }
            } else {
                console.error('未找到完整层级数据');
            }
        } catch (e) {
            console.error('加载卡片数据失败:', e);
        }
    }

    // 展示关系链卡片
    function showRelationChain(relationChain) {
        // 从localStorage获取完整层级数据
        const fullHierarchyData = localStorage.getItem('fullHierarchyData');

        if (!fullHierarchyData) {
            alert('未找到卡片数据');
            return;
        }

        const data = JSON.parse(fullHierarchyData);
        console.log(data, 'data');

        const ls1Data = JSON.parse(localStorage.getItem('ls1') || '{}');
        connections = ls1Data.connections || [];
        console.log(connections, 'connections');

        // 计算连接数
        calculateConnectionCounts();

        // 清空所有层级容器
        for (let i = 1; i <= 5; i++) {
            const container = document.getElementById(`golink-level-${i}-cards`);
            if (container) {
                container.innerHTML = '';
            }
            const levelDiv = document.getElementById(`golink-level-${i}`);
            if (levelDiv) {
                levelDiv.style.display = 'none';
            }
        }

        // 按层级分组
        const levelGroups = {};
        const levelsToRender = new Set();

        // 遍历关系链，按层级分组
        relationChain.forEach((cardId) => {
            // 查找卡片数据
            let block = null;
            let blockLevel = null;

            for (let level = 1; level <= 5; level++) {
                const levelKey = `level${level}`;
                if (data[levelKey]) {
                    block = data[levelKey].find(b => b.id === cardId);
                    if (block) {
                        blockLevel = level;
                        break;
                    }
                }
            }

            if (block && blockLevel) {
                if (!levelGroups[blockLevel]) {
                    levelGroups[blockLevel] = [];
                }
                levelGroups[blockLevel].push(block);
                levelsToRender.add(blockLevel);
            }
        });

        // 按层级顺序渲染
        const sortedLevels = Array.from(levelsToRender).sort((a, b) => a - b);

        // 渲染每个层级的卡片
        sortedLevels.forEach((level) => {
            const blocks = levelGroups[level] || [];
            const levelDiv = document.getElementById(`golink-level-${level}`);
            if (levelDiv) {
                levelDiv.style.display = 'block';
            }

            blocks.forEach((block) => {
                renderCard(block, level, sortedLevels.length);
            });
        });
        console.log(levelGroups, 'levelGroups');
        // 绘制连接线
        setTimeout(() => {
            drawConnections();
        }, 100);
    }

    // 渲染卡片
    function renderBlocks(allBlocks) {
        const ls1Data = JSON.parse(localStorage.getItem('ls1') || '{}');
        connections = ls1Data.connections || [];

        // 计算连接数
        calculateConnectionCounts();

        // 清空所有层级容器
        for (let i = 1; i <= 5; i++) {
            const container = document.getElementById(`golink-level-${i}-cards`);
            if (container) {
                container.innerHTML = '';
            }
            const levelDiv = document.getElementById(`golink-level-${i}`);
            if (levelDiv) {
                levelDiv.style.display = 'none';
            }
        }

        // 按层级分组
        const levelGroups = {};
        const levelsToRender = new Set();

        allBlocks.forEach((block) => {
            // 从ID中提取层级
            const level = parseInt(block.id[1]);
            if (!levelGroups[level]) {
                levelGroups[level] = [];
            }
            levelGroups[level].push(block);
            levelsToRender.add(level);
        });

        // 按层级顺序渲染
        const sortedLevels = Array.from(levelsToRender).sort((a, b) => a - b);

        // 渲染每个层级的卡片
        sortedLevels.forEach((level) => {
            const blocks = levelGroups[level] || [];
            const levelDiv = document.getElementById(`golink-level-${level}`);
            if (levelDiv) {
                levelDiv.style.display = 'block';
            }

            blocks.forEach((block) => {
                renderCard(block, level, sortedLevels.length);
            });
        });

        // 绘制连接线
        setTimeout(() => {
            drawConnections();
        }, 100);
    }

    // 渲染单个卡片
    function renderCard(block, level, maxLevel) {
        const container = document.getElementById(`golink-level-${level}-cards`);
        if (!container) return;

        const cardElement = document.createElement('div');
        cardElement.className = 'w_contp_item';
        cardElement.id = `card-${block.id}`;
        cardElement.setAttribute('data-card-id', block.id);
        cardElement.setAttribute('data-level', level);

        // 获取连接数
        const count = connectionCountMap.get(block.id) || 0;

        // 判断是否需要显示起点/终点连接点
        const isFirstLevel = level === 1;
        const isLastLevel = level === maxLevel;

        // 构建卡片HTML
        let html = `
            <div class="block-header">
                <span class="block-title">${block.title}</span>
            </div>
            <div class="block-content">
                <div class="block-content-text">${block.desc}</div>
            </div>
            <span class="w_contp_btn detail-btn" data-card-id="${block.id}" data-title="${block.title}" >
                详情
                <i class="fas fa-chevron-right"></i>
            </span>
            <div class="block-actions">
                <button class="action-btn edit-btn" data-card-id="${block.id}" data-title="${block.title}" >
                    <div class="xcustomSvg">
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M3.11727 11.8925L11.0722 3.9375L13.4587 6.32399L5.50376 14.2789L2.9913 15.1164C2.55156 15.263 2.13321 14.8446 2.27978 14.4049L3.11727 11.8925Z" fill="#606266"></path>
                            <path d="M11.8677 3.142L12.2655 2.74426C12.9245 2.08525 13.9929 2.08525 14.652 2.74426C15.311 3.40327 15.311 4.47173 14.652 5.13074L14.2542 5.52849L11.8677 3.142Z" fill="#606266"></path>
                            <path d="M10.4474 13.926H9.09744V15.276H10.4474V13.926Z" fill="#606266"></path>
                            <path d="M13.3725 13.926H12.0225V15.276H13.3725V13.926Z" fill="#606266"></path>
                            <path d="M14.9469 13.926H16.2969V15.276H14.9469V13.926Z" fill="#606266"></path>
                        </svg>
                    </div>
                    编辑
                </button>
            </div>
        `;

        // 添加连接点 - 第一层右边显示起点圆圈，最后一层右边不要连接点，其余层级左右都显示
        if (isFirstLevel) {
            if (count > 0) {
                html += `<div class="connector-point start-point">${count}</div>`;
            } else {
                html += `<div class="connector-point start-point" style="font-size:10px;">0</div>`;
            }
        } else {
            // 不是第一层，添加右上角连接数徽章
            html += `<div class="w_contp_inum">${count}</div>`;

            // 不是第一层，左边显示终点圆圈
            html += `<div class="connector-point end-point"></div>`;

            // 不是最后一层，右边显示起点圆圈
            if (!isLastLevel) {
                if (count > 0) {
                    html += `<div class="connector-point start-point">${count}</div>`;
                } else {
                    html += `<div class="connector-point start-point" style="font-size:10px;">0</div>`;
                }
            }
        }

        cardElement.innerHTML = html;

        // 绑定详情按钮事件
        const moreBtn = cardElement.querySelector('.detail-btn');
        if (moreBtn) {
            moreBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                const title = this.getAttribute('data-title');
                const content = this.closest('.w_contp_item').querySelector('.block-content-text').textContent;
                showDetailModal(title, content);
            });
        }

        // 绑定编辑按钮事件
        const editBtn = cardElement.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', function (e) {
                e.stopPropagation();

                const cardId = this.getAttribute('data-card-id');
                const title = this.getAttribute('data-title');
                const content = this.closest('.w_contp_item').querySelector('.block-content-text').textContent;

                showEditModal(cardId, title, content);
            });
        }

        container.appendChild(cardElement);
    }

    // 计算连接数
    function calculateConnectionCounts() {
        connectionCountMap.clear();

        connections.forEach(conn => {
            // 增加起始点的连接数
            if (connectionCountMap.has(conn.startId)) {
                connectionCountMap.set(conn.startId, connectionCountMap.get(conn.startId) + 1);
            } else {
                connectionCountMap.set(conn.startId, 1);
            }
            // 增加结束点的连接数
            if (connectionCountMap.has(conn.endId)) {
                connectionCountMap.set(conn.endId, connectionCountMap.get(conn.endId) + 1);
            } else {
                connectionCountMap.set(conn.endId, 1);
            }
        });
    }

    // 绘制连接线
    function drawConnections() {

        // 清空SVG内容，保留defs
        const defs = svg.querySelector('defs');
        svg.innerHTML = '';
        if (defs) {
            svg.appendChild(defs);
        }
        console.log(connections, 'connections');
        // 绘制每条连接线
        connections.forEach((conn) => {
            drawConnection(conn);
        });
    }

    // 绘制单条连接线
    function drawConnection(conn) {
        const startCard = document.getElementById(`card-${conn.startId}`);
        const endCard = document.getElementById(`card-${conn.endId}`);

        if (!startCard || !endCard) return;

        // 获取连接点
        const startPoint = startCard.querySelector('.start-point');
        const endPoint = endCard.querySelector('.end-point');

        if (!startPoint || !endPoint) return;

        // 获取连接点和 SVG 的位置
        const svgRect = svg.getBoundingClientRect();
        const startRect = startPoint.getBoundingClientRect();
        const endRect = endPoint.getBoundingClientRect();

        // 计算连接点在 SVG 坐标系中的位置
        const startX = startRect.left + startRect.width / 2 - svgRect.left;
        const startY = startRect.top + startRect.height / 2 - svgRect.top;
        const endX = endRect.left + endRect.width / 2 - svgRect.left;
        const endY = endRect.top + endRect.height / 2 - svgRect.top;

        // 创建贝塞尔曲线路径
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('class', 'path-line');
        path.setAttribute('stroke-width', String(3)); // 保持线条粗细
        path.setAttribute('fill', 'none');

        // 根据起始层级设置渐变色
        const startLevel = parseInt(conn.startId[1]) || 1;
        let gradientId = `gradient-level-${startLevel}-to-level-${startLevel + 1}`;
        path.setAttribute('stroke', `url(#${gradientId})`);

        // 贝塞尔曲线 - 更平滑
        const controlX1 = startX + (endX - startX) * 0.4;
        const controlX2 = startX + (endX - startX) * 0.6;
        const d = `M ${startX} ${startY} C ${controlX1} ${startY}, ${controlX2} ${endY}, ${endX} ${endY}`;
        path.setAttribute('d', d);
        
        svg.appendChild(path); 
        if ((conn.startId == 'b1' && conn.endId == 'c2')) {
            console.log(conn.startId)
            console.log(conn.endId)
            console.log(endY)
            console.log(d)
        }
        if ((conn.startId == 'b1' && conn.endId == 'c3')) {
            console.log(conn.startId)
            console.log(conn.endId)
            console.log(endY)
            console.log(d)
        }
    }



    // 更新连接线位置
    function updateConnections() {
        drawConnections();
    }

    // 查找指定ID的卡片
    function findBlockById(data, blockId) {
        for (const level in data) {
            if (data.hasOwnProperty(level) && Array.isArray(data[level])) {
                const block = data[level].find(b => b.id === blockId);
                if (block) {
                    return block;
                }
            }
        }
        return null;
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

    // ==================== 按钮初始化 ====================
    function initButtons() {
        // 返回按钮
        backBtn.addEventListener('click', function () {
            window.location.href = 'index.html';
        });
    }

    // ==================== 缩放功能 ====================
    function initZoom() {
        // 缩放按钮事件
        zoomMinusBtn.addEventListener('click', function () {
            setZoom(Math.max(20, currentZoom - 10));
        });

        zoomPlusBtn.addEventListener('click', function () {
            setZoom(Math.min(300, currentZoom + 10));
        });

        // 初始化鼠标滚轮缩放
        initWheelZoom();
    }

    function initWheelZoom() {
        // 绑定到 mapContainer
        mapContainer.addEventListener('wheel', handleWheelZoom, { passive: false });
    }

    function handleWheelZoom(e) {
        e.preventDefault();

        // 计算缩放增量
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(20, Math.min(300, currentZoom * delta));

        setZoom(newZoom);
    }

    function setZoom(percent) {
        currentZoom = percent;
        applyGroupTransform();
        zoomLevel.textContent = `${Math.round(currentZoom)}%`;

        // 延迟更新连接，确保布局已更新
        setTimeout(() => {
            updateConnections();
        }, 50);
    }

    function applyGroupTransform() {
        const scale = currentZoom / 100;
        contentContainer.style.transform = `translate(${groupOffsetX}px, ${groupOffsetY}px) scale(${scale})`;
        contentContainer.style.transformOrigin = 'top left';
    }

    // ==================== 拖拽功能 ====================
    function initDrag() {
        // 绑定到 mapContainer
        mapContainer.addEventListener('mousedown', handleMouseDown);
        mapContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('touchmove', handleDragMove, { passive: false });
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchend', handleDragEnd);
        document.addEventListener('mouseleave', handleDragEnd);
    }

    function handleMouseDown(e) {
        // 如果点击的是按钮，不拖拽
        if (e.target.closest('.action-btn')) return;

        e.preventDefault();
        e.stopPropagation();

        dragStartX = e.clientX - groupOffsetX;
        dragStartY = e.clientY - groupOffsetY;
        dragActive = true;
    }

    function handleTouchStart(e) {
        // 如果点击的是按钮，不拖拽
        if (e.target.closest('.action-btn')) return;

        e.preventDefault();
        e.stopPropagation();

        const touch = e.touches[0];
        dragStartX = touch.clientX - groupOffsetX;
        dragStartY = touch.clientY - groupOffsetY;
        dragActive = true;
    }

    function handleDragMove(e) {
        if (!dragActive) return;

        e.preventDefault();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        groupOffsetX = clientX - dragStartX;
        groupOffsetY = clientY - dragStartY;

        applyGroupTransform();

        // 延迟更新连接
        setTimeout(() => {
            updateConnections();
        }, 30);
    }

    function handleDragEnd() {
        dragActive = false;
    }

    // ==================== 弹窗功能 ====================
    function initModal() {
        // 详情弹窗关闭
        detailModalClose.addEventListener('click', hideDetailModal);
        detailModal.addEventListener('click', function (e) {
            if (e.target === detailModal) {
                hideDetailModal();
            }
        });

        // 编辑弹窗关闭
        editModalClose.addEventListener('click', hideEditModal);
        editModalCancel.addEventListener('click', hideEditModal);
        editModal.addEventListener('click', function (e) {
            if (e.target === editModal) {
                hideEditModal();
            }
        });
        editModalConfirm.addEventListener('click', confirmEdit);

        // ESC 关闭弹窗
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') {
                if (detailModal.classList.contains('show')) {
                    hideDetailModal();
                }
                if (editModal.classList.contains('show')) {
                    hideEditModal();
                }
            }
        });
    }

    function showDetailModal(title, content) {
        detailModalTitle.textContent = title;
        detailModalContent.textContent = content;
        detailModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    function hideDetailModal() {
        detailModal.classList.remove('show');
        document.body.style.overflow = '';
    }

    function showEditModal(cardId, title, desc) {
        currentEditingBlock = cardId;
        editBlockNameInput.value = title;

        // 获取完整数据来填充教师参考信息
        const fullData = localStorage.getItem('fullHierarchyData');
        let teacherNote = '';
        if (fullData) {
            const data = JSON.parse(fullData);
            const block = findBlockById(data, cardId);
            if (block && block.teacherNote) {
                teacherNote = block.teacherNote;
            }
        }

        // 设置描述和教师参考信息
        editBlockDesc.innerHTML = desc;
        editBlockTeacher.innerHTML = teacherNote || '暂无教师参考';

        // 显示弹窗
        editModal.classList.add('show');
        document.body.style.overflow = 'hidden';

    }

    function hideEditModal() {
        currentEditingBlock = null;
        editModal.classList.remove('show');
        document.body.style.overflow = '';
    }

    function confirmEdit() {
        const newTitle = editBlockNameInput.value;

        if (!newTitle.trim()) {
            alert('标题不能为空');
            return;
        }

        // 更新卡片数据
        updateBlockData(currentEditingBlock, newTitle);
        hideEditModal();

        // 重新渲染页面
        if (localStorage.getItem('relationChain')) {
            showRelationChain(JSON.parse(localStorage.getItem('relationChain')));
        } else {
            loadBlockData();
        }
    }

    function updateBlockData(cardId, newTitle) {
        const fullData = localStorage.getItem('fullHierarchyData');
        if (fullData) {
            const data = JSON.parse(fullData);
            const block = findBlockById(data, cardId);
            if (block) {
                block.title = newTitle;
                localStorage.setItem('fullHierarchyData', JSON.stringify(data));
            }
        }
    }

})();
