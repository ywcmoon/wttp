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
    let currentZoom = 100;
    let dragActive = false;
    let dragStartX = 0;
    let dragStartY = 0;
    let groupOffsetX = 0;
    let groupOffsetY = 0;
    let currentBlockId = null;
    let connections = [];
    let connectionCountMap = new Map();
    let currentEditingBlock = null;
    let svgConnectorPoints = new Map();
    let connectorGroup = null;

    const LEVEL_COLORS = {
        a: '#409eff', b: '#67c23a', c: '#e6a23c', d: '#f56c6c', e: '#E372DB'
    };

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

        window.addEventListener('resize', function () {
            if (typeof updateSvgConnectorPositions === 'function') {
                updateSvgConnectorPositions();
            }
            drawConnections();
        });
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
        cardElement.className = `w_contp_item level-${level}`;
        cardElement.id = `card-${block.id}`;
        cardElement.setAttribute('data-card-id', block.id);
        cardElement.setAttribute('data-level', level);

        const isFirstLevel = level === 1;
        const isLastLevel = level === maxLevel;

        let badge = '';
        if (!isFirstLevel && !isLastLevel) {
            badge = `<div class="w_contp_inum">0</div>`;
        }

        let html = `
            <div class="block-header">
                <span class="block-title">${block.title}</span>
            </div>
            <div class="block-content">
                <div class="block-content-text">${block.desc}</div>
                <span class="w_contp_btn detail-btn" data-card-id="${block.id}" data-title="${block.title}" >
                    详情
                    <i class="fas fa-chevron-right"></i>
                </span>
            </div>
            <div class="block-actions">
                <span class="action-btn edit-btn" title="编辑" data-card-id="${block.id}" data-title="${block.title}">
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
            </div>
            ${badge}
        `;

        cardElement.innerHTML = html;

        const moreBtn = cardElement.querySelector('.detail-btn');
        if (moreBtn) {
            moreBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                const title = this.getAttribute('data-title');
                const content = this.closest('.w_contp_item').querySelector('.block-content-text').textContent;
                showDetailModal(title, content);
            });
        }

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

        // 双击卡片回到画布中心
        cardElement.addEventListener('dblclick', function (e) {
            e.stopPropagation();
            centerOnCard(this);
        });
    }

    // 计算连接数
    function calculateConnectionCounts() {
        connectionCountMap.clear();

        connections.forEach(conn => {
            if (connectionCountMap.has(conn.startId)) {
                connectionCountMap.set(conn.startId, connectionCountMap.get(conn.startId) + 1);
            } else {
                connectionCountMap.set(conn.startId, 1);
            }
        });
    }

    // 绘制连接线
    function drawConnections() {
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

        connections.forEach(function (conn) {
            drawConnection(conn, linesGroup);
        });

        updateBadges();
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
            var sDataId = c.startId + '-start';
            if (map.has(sDataId)) {
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

    function drawConnection(conn, linesGroup) {
        var startInfo = svgConnectorPoints.get(conn.startId + '-start');
        var endInfo = svgConnectorPoints.get(conn.endId + '-end');

        if (!startInfo || !endInfo) return;

        var startElement = startInfo.element;
        var endElement = endInfo.element;

        var startTransform = startElement.getAttribute('transform');
        var startMatch = startTransform && startTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!startMatch) return;
        var startX = parseFloat(startMatch[1]);
        var startY = parseFloat(startMatch[2]);

        var endTransform = endElement.getAttribute('transform');
        var endMatch = endTransform && endTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!endMatch) return;
        var endX = parseFloat(endMatch[1]);
        var endY = parseFloat(endMatch[2]);

        var svgNS = 'http://www.w3.org/2000/svg';
        var path = document.createElementNS(svgNS, 'path');
        path.setAttribute('class', 'path-line');
        path.setAttribute('stroke-width', '2.5');
        path.setAttribute('fill', 'none');

        var startBlock = startInfo.block;
        var endBlock = endInfo.block;
        var startLevelKey = startBlock ? startBlock.getAttribute('data-card-id')[0].toLowerCase() : 'a';
        var endLevelKey = endBlock ? endBlock.getAttribute('data-card-id')[0].toLowerCase() : 'b';

        var levelColors = { a: '#409eff', b: '#67c23a', c: '#e6a23c', d: '#f56c6c', e: '#E372DB' };
        var c1 = levelColors[startLevelKey] || '#409eff';
        var c2 = levelColors[endLevelKey] || '#67c23a';

        var gradientId = 'conn-grad-' + conn.startId + '-' + conn.endId;
        var lg = document.createElementNS(svgNS, 'linearGradient');
        lg.setAttribute('id', gradientId);
        lg.setAttribute('gradientUnits', 'userSpaceOnUse');
        lg.setAttribute('x1', String(startX));
        lg.setAttribute('y1', String(startY));
        lg.setAttribute('x2', String(endX));
        lg.setAttribute('y2', String(endY));
        var s1 = document.createElementNS(svgNS, 'stop');
        s1.setAttribute('offset', '0%');
        s1.setAttribute('stop-color', c1);
        var s2 = document.createElementNS(svgNS, 'stop');
        s2.setAttribute('offset', '100%');
        s2.setAttribute('stop-color', c2);
        lg.appendChild(s1);
        lg.appendChild(s2);

        var defs = svg.querySelector('defs');
        if (defs) defs.appendChild(lg);

        path.setAttribute('stroke', 'url(#' + gradientId + ')');

        var cx = (startX + endX) / 2;
        var bend = Math.abs(startY - endY) < 0.1 ? 0.5 : 0;
        var d = 'M ' + startX + ' ' + startY + ' C ' + cx + ' ' + (startY + bend) + ', ' + cx + ' ' + (endY - bend) + ', ' + endX + ' ' + endY;
        path.setAttribute('d', d);

        linesGroup.appendChild(path);
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
        e.stopPropagation();

        // 缩放中心 = 鼠标在 mapContainer 内的位置
        const containerRect = mapContainer.getBoundingClientRect();
        const mouseX = e.clientX - containerRect.left;
        const mouseY = e.clientY - containerRect.top;

        // 计算缩放前鼠标位置对应的内容坐标
        const oldScale = currentZoom / 100;
        const contentX = (mouseX - groupOffsetX) / oldScale;
        const contentY = (mouseY - groupOffsetY) / oldScale;

        // 计算缩放增量
        const delta = e.deltaY > 0 ? 0.9 : 1.1;
        const newZoom = Math.max(20, Math.min(300, currentZoom * delta));
        const newScale = newZoom / 100;

        // 调整偏移使鼠标位置对应的内容点保持不变
        groupOffsetX = mouseX - contentX * newScale;
        groupOffsetY = mouseY - contentY * newScale;

        currentZoom = newZoom;
        applyGroupTransform();
        zoomLevel.textContent = `${Math.round(currentZoom)}%`;

        drawConnections();
    }

    function setZoom(percent) {
        currentZoom = percent;
        applyGroupTransform();
        zoomLevel.textContent = `${Math.round(currentZoom)}%`;

        drawConnections();
    }

    function applyGroupTransform() {
        const scale = currentZoom / 100;
        contentContainer.style.transform = `translate(${groupOffsetX}px, ${groupOffsetY}px) scale(${scale})`;
        contentContainer.style.transformOrigin = 'top left';
    }

    // 双击卡片回到画布中心
    function centerOnCard(cardElement) {
        const mapRect = mapContainer.getBoundingClientRect();
        const cardRect = cardElement.getBoundingClientRect();

        const cardCenterX = cardRect.left - mapRect.left + cardRect.width / 2;
        const cardCenterY = cardRect.top - mapRect.top + cardRect.height / 2;

        const mapCenterX = mapRect.width / 2;
        const mapCenterY = mapRect.height / 2;

        groupOffsetX += mapCenterX - cardCenterX;
        groupOffsetY += mapCenterY - cardCenterY;

        applyGroupTransform();
        drawConnections();
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
        updateSvgConnectorPositions();
        drawConnections();
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

        const fullData = localStorage.getItem('fullHierarchyData');
        let teacherNote = '';
        if (fullData) {
            const data = JSON.parse(fullData);
            const block = findBlockById(data, cardId);
            if (block && block.teacherNote) {
                teacherNote = block.teacherNote;
            }
        }

        if (!window.editBlockEditorDesc) {
            window.editBlockEditorDesc = new Quill('#edit-block-desc', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline', 'strike'],
                        ['blockquote', 'code-block'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'header': [1, 2, 3, false] }],
                        ['link'],
                        ['clean']
                    ]
                }
            });
        }

        if (!window.editBlockEditorTeacher) {
            window.editBlockEditorTeacher = new Quill('#edit-block-teacher', {
                theme: 'snow',
                modules: {
                    toolbar: [
                        ['bold', 'italic', 'underline', 'strike'],
                        ['blockquote', 'code-block'],
                        [{ 'list': 'ordered' }, { 'list': 'bullet' }],
                        [{ 'header': [1, 2, 3, false] }],
                        ['link'],
                        ['clean']
                    ]
                }
            });
        }

        window.editBlockEditorDesc.root.innerHTML = desc || '';
        window.editBlockEditorTeacher.root.innerHTML = teacherNote || '';

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

        const newDesc = window.editBlockEditorDesc ? window.editBlockEditorDesc.root.innerHTML : '';
        const newTeacher = window.editBlockEditorTeacher ? window.editBlockEditorTeacher.root.innerHTML : '';

        updateBlockData(currentEditingBlock, newTitle, newDesc, newTeacher);
        hideEditModal();

        if (localStorage.getItem('relationChain')) {
            showRelationChain(JSON.parse(localStorage.getItem('relationChain')));
        } else {
            loadBlockData();
        }
    }

    function updateBlockData(cardId, newTitle, newDesc, newTeacher) {
        const fullData = localStorage.getItem('fullHierarchyData');
        if (fullData) {
            const data = JSON.parse(fullData);
            const block = findBlockById(data, cardId);
            if (block) {
                block.title = newTitle;
                if (newDesc !== undefined) block.desc = newDesc;
                if (newTeacher !== undefined) block.teacherNote = newTeacher;
                localStorage.setItem('fullHierarchyData', JSON.stringify(data));
            }
        }
    }

})();
