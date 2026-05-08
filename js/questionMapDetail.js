/**
 * questionMapDetail.js - 问题图谱详情页核心脚本
 * 
 * 功能说明：
 *   1. 层级卡片渲染（按 level1~level5 分组展示）
 *   2. SVG 连线绘制（卡片间关系连线，渐变色路径）
 *   3. 画布拖拽与缩放（鼠标拖拽平移、滚轮缩放、双击居中）
 *   4. 卡片详情弹窗（查看卡片标题和描述）
 *   5. 卡片编辑弹窗（Quill 富文本编辑器，支持标题/描述/教师备注）
 *   6. 关系链模式（从 index 页传入 relationChain，仅展示链路上的卡片）
 * 
 * 数据存储键：
 *   - fullHierarchyData：完整层级卡片数据
 *   - ls1：连线数据（connections 数组）
 *   - relationChain：关系链卡片 ID 列表
 *   - currentBlockId：当前查看的卡片 ID
 * 
 * 依赖：
 *   - common.js（StorageManager）
 *   - Quill（富文本编辑器）
 *   - Font Awesome（图标）
 */
(function () {
    'use strict';

    // ==================== DOM 元素引用 ====================

    /** @type {HTMLElement} 画布容器（拖拽/缩放区域） */ 
    var mainContainer = document.getElementById('main-container');

    /** @type {HTMLElement} 内容容器（应用 transform 变换） */
    var contentContainer = document.getElementById('content-container');

    /** @type {SVGSVGElement} SVG 连线层 */
    var svg = document.getElementById('golink-connections-svg');

    var backBtn = document.getElementById('back-btn');
    var zoomMinusBtn = document.getElementById('zoom-minus');
    var zoomPlusBtn = document.getElementById('zoom-plus');
    var zoomLevel = document.getElementById('zoom-level');

    var detailModal = document.getElementById('detail-modal-overlay');
    var detailModalTitle = document.getElementById('detail-modal-title');
    var detailModalContent = document.getElementById('detail-modal-content');
    var detailModalClose = document.getElementById('detail-modal-close');

    var editModal = document.getElementById('edit-block-modal-overlay');
    var editModalClose = document.getElementById('edit-block-modal-close');
    var editModalCancel = document.getElementById('edit-block-btn-cancel');
    var editModalConfirm = document.getElementById('edit-block-btn-confirm');
    var editBlockNameInput = document.getElementById('edit-block-name');
    var editBlockDesc = document.getElementById('edit-block-desc');
    var editBlockTeacher = document.getElementById('edit-block-teacher');

    // ==================== 核心状态变量 ====================

    /** @type {number} 当前缩放百分比（100 = 原始大小） */
    var currentZoom = 100;

    /** @type {boolean} 是否正在拖拽画布 */
    var dragActive = false;

    /** @type {number} 拖拽起始 X 坐标 */
    var dragStartX = 0;

    /** @type {number} 拖拽起始 Y 坐标 */
    var dragStartY = 0;

    /** @type {number} 内容容器 X 轴偏移 */
    var groupOffsetX = 0;

    /** @type {number} 内容容器 Y 轴偏移 */
    var groupOffsetY = 0;

    /** @type {string|null} 当前查看的卡片 ID */
    var currentBlockId = null;

    /** @type {Array} 连线数据数组 [{startId, endId}, ...] */
    var connections = [];

    /** @type {Map<string, number>} 每个起始节点的连线数量统计 */
    var connectionCountMap = new Map();

    /** @type {string|null} 当前正在编辑的卡片 ID */
    var currentEditingBlock = null;

    /** @type {Map<string, Object>} SVG 连接点信息映射 */
    var svgConnectorPoints = new Map();

    /** @type {SVGGElement|null} SVG 连接点组 */
    var connectorGroup = null;

    /**
     * 层级颜色映射（从 CSS 变量动态读取）
     * a: 蓝色, b: 绿色, c: 橙色, d: 红色, e: 粉色
     */
    var LEVEL_COLORS = {
        a: getComputedStyle(document.documentElement).getPropertyValue('--color-level-a').trim() || '#409eff',
        b: getComputedStyle(document.documentElement).getPropertyValue('--color-level-b').trim() || '#67c23a',
        c: getComputedStyle(document.documentElement).getPropertyValue('--color-level-c').trim() || '#e6a23c',
        d: getComputedStyle(document.documentElement).getPropertyValue('--color-level-d').trim() || '#f56c6c',
        e: getComputedStyle(document.documentElement).getPropertyValue('--color-level-e').trim() || '#E372DB'
    };

    // ==================== 应用初始化入口 ====================

    /**
     * DOMContentLoaded 初始化
     * 
     * 初始化流程：
     *   1. 检查是否有 relationChain（关系链模式）
     *   2. 否则检查 currentBlockId（单卡片模式）
     *   3. 都没有则跳回首页
     *   4. 初始化按钮、缩放、拖拽、弹窗
     *   5. 绑定窗口 resize 事件更新连线
     */
    document.addEventListener('DOMContentLoaded', function () {
        var relationChain = StorageManager.get('relationChain', null);
        if (relationChain) {
            showRelationChain(relationChain);
        } else {
            currentBlockId = StorageManager.get('currentBlockId', null);
            if (!currentBlockId) {
                window.location.href = 'index.html';
                return;
            }
            loadBlockData();
        }

        initButtons();
        initZoom();
        initDrag();
        initModal();

        window.addEventListener('resize', function () {
            if (typeof updateSvgConnectorPositions === 'function') {
                updateSvgConnectorPositions();
            }
            drawConnections();
        });
    });

    // ==================== 数据加载 ====================

    /**
     * 加载卡片数据并渲染
     * 
     * 从 fullHierarchyData 中查找 currentBlockId 对应的卡片，
     * 然后获取该卡片及其所有下级卡片，按层级渲染
     */
    function loadBlockData() {
        var data = StorageManager.get('fullHierarchyData', null);
        if (data) {
            var currentBlock = findBlockById(data, currentBlockId);
            if (currentBlock) {
                var allBlocks = getAllBlocks(currentBlock, data);
                renderBlocks(allBlocks);
            } else {
                console.error('未找到当前卡片:', currentBlockId);
            }
        } else {
            console.error('未找到完整层级数据');
        }
    }

    /**
     * 展示关系链卡片（关系链模式）
     * 
     * 与普通模式的区别：
     *   - 仅渲染 relationChain 中指定的卡片
     *   - 不渲染无关的层级卡片
     * 
     * @param {Array<string>} relationChain - 关系链卡片 ID 列表
     */
    function showRelationChain(relationChain) {
        var data = StorageManager.get('fullHierarchyData', null);

        if (!data) {
            alert('未找到卡片数据');
            return;
        }

        var ls1Data = StorageManager.get('ls1', {});
        connections = ls1Data.connections || [];

        calculateConnectionCounts();

        for (var i = 1; i <= 5; i++) {
            var container = document.getElementById('golink-level-' + i + '-cards');
            if (container) {
                container.innerHTML = '';
            }
            var levelDiv = document.getElementById('golink-level-' + i);
            if (levelDiv) {
                levelDiv.style.display = 'none';
            }
        }

        var levelGroups = {};
        var levelsToRender = new Set();

        relationChain.forEach(function (cardId) {
            var block = null;
            var blockLevel = null;

            for (var level = 1; level <= 5; level++) {
                var levelKey = 'level' + level;
                if (data[levelKey]) {
                    block = data[levelKey].find(function (b) { return b.id === cardId; });
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

        var sortedLevels = Array.from(levelsToRender).sort(function (a, b) { return a - b; });

        sortedLevels.forEach(function (level) {
            var blocks = levelGroups[level] || [];
            var levelDiv = document.getElementById('golink-level-' + level);
            if (levelDiv) {
                levelDiv.style.display = 'block';
            }

            blocks.forEach(function (block) {
                renderCard(block, level, sortedLevels.length);
            });
        });

        setTimeout(function () {
            drawConnections();
        }, 100);
    }

    /**
     * 渲染所有卡片（普通模式）
     * 
     * @param {Array} allBlocks - 所有需要渲染的卡片数据
     */
    function renderBlocks(allBlocks) {
        var ls1Data = StorageManager.get('ls1', {});
        connections = ls1Data.connections || [];

        calculateConnectionCounts();

        for (var i = 1; i <= 5; i++) {
            var container = document.getElementById('golink-level-' + i + '-cards');
            if (container) {
                container.innerHTML = '';
            }
            var levelDiv = document.getElementById('golink-level-' + i);
            if (levelDiv) {
                levelDiv.style.display = 'none';
            }
        }

        var levelGroups = {};
        var levelsToRender = new Set();

        allBlocks.forEach(function (block) {
            var level = parseInt(block.id[1]);
            if (!levelGroups[level]) {
                levelGroups[level] = [];
            }
            levelGroups[level].push(block);
            levelsToRender.add(level);
        });

        var sortedLevels = Array.from(levelsToRender).sort(function (a, b) { return a - b; });

        sortedLevels.forEach(function (level) {
            var blocks = levelGroups[level] || [];
            var levelDiv = document.getElementById('golink-level-' + level);
            if (levelDiv) {
                levelDiv.style.display = 'block';
            }

            blocks.forEach(function (block) {
                renderCard(block, level, sortedLevels.length);
            });
        });

        setTimeout(function () {
            drawConnections();
        }, 100);
    }

    /**
     * 渲染单个卡片 DOM
     * 
     * @param {Object} block - 卡片数据 {id, title, desc, teacherNote}
     * @param {number} level - 卡片层级（1~5）
     * @param {number} maxLevel - 当前视图中的最大层级
     * 
     * 卡片结构：
     *   - block-header：标题
     *   - block-content：描述文本 + 详情按钮
     *   - block-actions：编辑按钮（SVG 图标）
     *   - badge：连线数量角标（中间层级显示）
     * 
     * 交互：
     *   - 详情按钮 → 打开详情弹窗
     *   - 编辑按钮 → 打开编辑弹窗
     *   - 双击卡片 → 居中显示
     */
    function renderCard(block, level, maxLevel) {
        var container = document.getElementById('golink-level-' + level + '-cards');
        if (!container) return;

        var cardElement = document.createElement('div');
        cardElement.className = 'w_contp_item level-' + level;
        cardElement.id = 'card-' + block.id;
        cardElement.setAttribute('data-card-id', block.id);
        cardElement.setAttribute('data-level', level);

        var isFirstLevel = level === 1;
        var isLastLevel = level === maxLevel;

        var badge = '';
        if (!isFirstLevel && !isLastLevel) {
            badge = '<div class="w_contp_inum">0</div>';
        }

        var html =
            '<div class="block-header">' +
                '<span class="block-title">' + block.title + '</span>' +
            '</div>' +
            '<div class="block-content">' +
                '<div class="block-content-text">' + block.desc + '</div>' +
                '<span class="w_contp_btn detail-btn" data-card-id="' + block.id + '" data-title="' + block.title + '">' +
                    '详情' +
                    '<i class="fas fa-chevron-right"></i>' +
                '</span>' +
            '</div>' +
            '<div class="block-actions">' +
                '<span class="action-btn edit-btn" title="编辑" data-card-id="' + block.id + '" data-title="' + block.title + '">' +
                    '<div class="xcustomSvg">' +
                        '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                            '<path d="M3.11727 11.8925L11.0722 3.9375L13.4587 6.32399L5.50376 14.2789L2.9913 15.1164C2.55156 15.263 2.13321 14.8446 2.27978 14.4049L3.11727 11.8925Z" fill="#606266"></path>' +
                            '<path d="M11.8677 3.142L12.2655 2.74426C12.9245 2.08525 13.9929 2.08525 14.652 2.74426C15.311 3.40327 15.311 4.47173 14.652 5.13074L14.2542 5.52849L11.8677 3.142Z" fill="#606266"></path>' +
                            '<path d="M10.4474 13.926H9.09744V15.276H10.4474V13.926Z" fill="#606266"></path>' +
                            '<path d="M13.3725 13.926H12.0225V15.276H13.3725V13.926Z" fill="#606266"></path>' +
                            '<path d="M14.9469 13.926H16.2969V15.276H14.9469V13.926Z" fill="#606266"></path>' +
                        '</svg>' +
                    '</div>' +
                '</span>' +
            '</div>' +
            badge;

        cardElement.innerHTML = html;

        var moreBtn = cardElement.querySelector('.detail-btn');
        if (moreBtn) {
            moreBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var title = this.getAttribute('data-title');
                var content = this.closest('.w_contp_item').querySelector('.block-content-text').textContent;
                showDetailModal(title, content);
            });
        }

        var editBtn = cardElement.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var cardId = this.getAttribute('data-card-id');
                var title = this.getAttribute('data-title');
                var content = this.closest('.w_contp_item').querySelector('.block-content-text').textContent;
                showEditModal(cardId, title, content);
            });
        }

        container.appendChild(cardElement);

        cardElement.addEventListener('dblclick', function (e) {
            e.stopPropagation();
            centerOnCard(this);
        });
    }

    // ==================== 连线统计 ====================

    /**
     * 计算每个起始节点的连线数量
     * 结果存入 connectionCountMap
     */
    function calculateConnectionCounts() {
        connectionCountMap.clear();

        connections.forEach(function (conn) {
            if (connectionCountMap.has(conn.startId)) {
                connectionCountMap.set(conn.startId, connectionCountMap.get(conn.startId) + 1);
            } else {
                connectionCountMap.set(conn.startId, 1);
            }
        });
    }

    // ==================== SVG 连线绘制 ====================

    /**
     * 绘制所有连线
     * 
     * 绘制流程：
     *   1. 清空 SVG
     *   2. 创建 defs（渐变定义容器）
     *   3. 创建连线组和连接点组
     *   4. 为每个卡片创建起始/结束连接点
     *   5. 更新连接点位置
     *   6. 绘制每条连线（渐变色贝塞尔曲线）
     *   7. 更新角标数字
     */
    function drawConnections() {
        svg.innerHTML = '';

        var svgNS = 'http://www.w3.org/2000/svg';

        var defs = document.createElementNS(svgNS, 'defs');
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

    /**
     * 创建 SVG 连接点（卡片左右两侧的圆形端点）
     * 
     * @param {HTMLElement} block - 卡片 DOM 元素
     * @param {string} type - 连接点类型：'start'（右侧输出）或 'end'（左侧输入）
     * @param {string} blockId - 卡片 ID
     * 
     * 连接点样式：
     *   - start 点：实心圆（填充层级颜色），a 级卡片半径 10，其他 8
     *   - end 点：空心圆（白色填充 + 层级颜色描边）
     *   - a 级 start 点额外显示连线数量文字
     */
    function createSvgConnectorPoint(block, type, blockId) {
        var svgNS = 'http://www.w3.org/2000/svg';
        var dataId = blockId + '-' + type;
        var levelKey = blockId[0].toLowerCase();
        var color = LEVEL_COLORS[levelKey] || '#409eff';
        var baseRadius = blockId.startsWith('a') ? 10 : 8;
        var scale = currentZoom / 100;
        var radius = baseRadius * scale;

        var g = document.createElementNS(svgNS, 'g');
        g.setAttribute('class', 'svg-connector-point svg-' + type + '-point');
        g.setAttribute('data-id', dataId);
        g.setAttribute('data-block-id', blockId);

        var outerCircle = document.createElementNS(svgNS, 'circle');
        outerCircle.setAttribute('r', String(radius));
        outerCircle.setAttribute('fill', type === 'start' && blockId.startsWith('a') ? color : '#fff');
        outerCircle.setAttribute('stroke', color);
        outerCircle.setAttribute('stroke-width', String(2 * scale));
        outerCircle.setAttribute('class', 'svg-connector-outer');
        g.appendChild(outerCircle);

        if (type === 'start' && blockId.startsWith('a')) {
            var text = document.createElementNS(svgNS, 'text');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'central');
            text.setAttribute('fill', '#fff');
            text.setAttribute('font-size', String(10 * scale));
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

    /**
     * 更新所有 SVG 连接点的位置
     * 
     * 根据卡片在视口中的实际位置计算连接点坐标：
     *   - start 点：卡片右边缘中心
     *   - end 点：卡片左边缘中心
     * 
     * 如果卡片不可见（offsetParent 为 null），隐藏连接点
     */
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

    /**
     * 更新连线数量角标
     * 
     * 统计每个 start 连接点对应的连线数量：
     *   - a 级卡片：更新 SVG 连接点内的文字
     *   - 其他卡片：更新 DOM 中的 w_contp_inum 角标
     */
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

    /**
     * 绘制单条连线
     * 
     * @param {Object} conn - 连线数据 {startId, endId}
     * @param {SVGGElement} linesGroup - 连线组元素
     * 
     * 连线样式：
     *   - 渐变色：从起始节点颜色渐变到结束节点颜色
     *   - 贝塞尔曲线：水平方向的 S 形曲线
     *   - 线宽 2.5px
     */
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

    // ==================== 卡片查找工具 ====================

    /**
     * 在层级数据中查找指定 ID 的卡片
     * 
     * @param {Object} data - fullHierarchyData 数据
     * @param {string} blockId - 卡片 ID
     * @returns {Object|null} 找到的卡片数据
     */
    function findBlockById(data, blockId) {
        for (var level in data) {
            if (data.hasOwnProperty(level) && Array.isArray(data[level])) {
                var block = data[level].find(function (b) { return b.id === blockId; });
                if (block) {
                    return block;
                }
            }
        }
        return null;
    }

    /**
     * 获取当前卡片及其所有下级卡片
     * 
     * @param {Object} currentBlock - 当前卡片数据
     * @param {Object} data - fullHierarchyData 数据
     * @returns {Array} 包含当前卡片和所有下级卡片的数组
     */
    function getAllBlocks(currentBlock, data) {
        var allBlocks = [currentBlock];
        var level = parseInt(currentBlock.id[1]);

        for (var i = level + 1; i <= 5; i++) {
            var levelKey = 'level' + i;
            if (data[levelKey]) {
                allBlocks.push.apply(allBlocks, data[levelKey]);
            }
        }

        return allBlocks;
    }

    // ==================== 按钮初始化 ====================

    /**
     * 初始化按钮事件
     * 返回按钮 → 跳回首页
     */
    function initButtons() {
        backBtn.addEventListener('click', function () {
            window.location.href = 'index.html';
        });
    }

    // ==================== 缩放功能 ====================

    /**
     * 初始化缩放功能
     * 绑定缩放按钮和鼠标滚轮事件
     */
    function initZoom() {
        zoomMinusBtn.addEventListener('click', function () {
            setZoom(Math.max(20, currentZoom - 10));
        });

        zoomPlusBtn.addEventListener('click', function () {
            setZoom(Math.min(300, currentZoom + 10));
        });

        initWheelZoom();
    }

    /**
     * 初始化鼠标滚轮缩放
     * 绑定到 mainContainer，passive: false 以允许 preventDefault
     */
    function initWheelZoom() {
        mainContainer.addEventListener('wheel', handleWheelZoom, { passive: false });
    }

    /**
     * 处理鼠标滚轮缩放事件
     * 
     * @param {WheelEvent} e - 滚轮事件
     * 
     * 缩放算法：
     *   1. 计算鼠标在容器内的位置
     *   2. 将鼠标位置转换为内容坐标系中的点
     *   3. 应用缩放因子（deltaY > 0 缩小，< 0 放大）
     *   4. 调整偏移使鼠标指向的内容点保持不变
     *   5. 缩放范围：20% ~ 300%
     */
    function handleWheelZoom(e) {
        e.preventDefault();
        e.stopPropagation();

        var containerRect = mainContainer.getBoundingClientRect();
        var mouseX = e.clientX - containerRect.left;
        var mouseY = e.clientY - containerRect.top;

        var oldScale = currentZoom / 100;
        var contentX = (mouseX - groupOffsetX) / oldScale;
        var contentY = (mouseY - groupOffsetY) / oldScale;

        var delta = e.deltaY > 0 ? 0.9 : 1.1;
        var newZoom = Math.max(20, Math.min(300, currentZoom * delta));
        var newScale = newZoom / 100;

        groupOffsetX = mouseX - contentX * newScale;
        groupOffsetY = mouseY - contentY * newScale;

        currentZoom = newZoom;
        applyGroupTransform();
        zoomLevel.textContent = Math.round(currentZoom) + '%';

        drawConnections();
    }

    /**
     * 设置缩放百分比
     * 
     * @param {number} percent - 缩放百分比（20~300）
     */
    function setZoom(percent) {
        currentZoom = percent;
        applyGroupTransform();
        zoomLevel.textContent = Math.round(currentZoom) + '%';

        drawConnections();
    }

    /**
     * 应用 CSS transform 到内容容器
     * 使用 translate + scale 实现平移和缩放
     */
    function applyGroupTransform() {
        var scale = currentZoom / 100;
        contentContainer.style.transform = 'translate(' + groupOffsetX + 'px, ' + groupOffsetY + 'px) scale(' + scale + ')';
        contentContainer.style.transformOrigin = 'top left';
    }

    /**
     * 将指定卡片居中显示在画布中
     * 
     * @param {HTMLElement} cardElement - 卡片 DOM 元素
     * 
     * 算法：计算卡片中心与画布中心的偏移差，调整 groupOffset
     */
    function centerOnCard(cardElement) {
        var mapRect = mainContainer.getBoundingClientRect();
        var cardRect = cardElement.getBoundingClientRect();

        var cardCenterX = cardRect.left - mapRect.left + cardRect.width / 2;
        var cardCenterY = cardRect.top - mapRect.top + cardRect.height / 2;

        var mapCenterX = mapRect.width / 2;
        var mapCenterY = mapRect.height / 2;

        groupOffsetX += mapCenterX - cardCenterX;
        groupOffsetY += mapCenterY - cardCenterY;

        applyGroupTransform();
        drawConnections();
    }

    // ==================== 拖拽功能 ====================

    /**
     * 初始化画布拖拽功能
     * 支持鼠标和触摸事件
     */
    function initDrag() {
        mainContainer.addEventListener('mousedown', handleMouseDown);
        mainContainer.addEventListener('touchstart', handleTouchStart, { passive: false });
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('touchmove', handleDragMove, { passive: false });
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchend', handleDragEnd);
        document.addEventListener('mouseleave', handleDragEnd);
    }

    /**
     * 鼠标按下 - 开始拖拽
     * 如果点击的是操作按钮，不触发拖拽
     */
    function handleMouseDown(e) {
        if (e.target.closest('.action-btn')) return;

        e.preventDefault();
        e.stopPropagation();

        dragStartX = e.clientX - groupOffsetX;
        dragStartY = e.clientY - groupOffsetY;
        dragActive = true;
    }

    /**
     * 触摸开始 - 开始拖拽
     */
    function handleTouchStart(e) {
        if (e.target.closest('.action-btn')) return;

        e.preventDefault();
        e.stopPropagation();

        var touch = e.touches[0];
        dragStartX = touch.clientX - groupOffsetX;
        dragStartY = touch.clientY - groupOffsetY;
        dragActive = true;
    }

    /**
     * 拖拽移动 - 更新偏移并重绘
     */
    function handleDragMove(e) {
        if (!dragActive) return;

        e.preventDefault();

        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;

        groupOffsetX = clientX - dragStartX;
        groupOffsetY = clientY - dragStartY;

        applyGroupTransform();
        updateSvgConnectorPositions();
        drawConnections();
    }

    /**
     * 拖拽结束
     */
    function handleDragEnd() {
        dragActive = false;
    }

    // ==================== 弹窗功能 ====================

    /**
     * 初始化弹窗事件
     * 
     * 弹窗关闭方式：
     *   - 点击关闭按钮
     *   - 点击遮罩层
     *   - 按 ESC 键
     */
    function initModal() {
        detailModalClose.addEventListener('click', hideDetailModal);
        detailModal.addEventListener('click', function (e) {
            if (e.target === detailModal) {
                hideDetailModal();
            }
        });

        editModalClose.addEventListener('click', hideEditModal);
        editModalCancel.addEventListener('click', hideEditModal);
        editModal.addEventListener('click', function (e) {
            if (e.target === editModal) {
                hideEditModal();
            }
        });
        editModalConfirm.addEventListener('click', confirmEdit);

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

    /**
     * 显示详情弹窗
     * 
     * @param {string} title - 卡片标题
     * @param {string} content - 卡片描述内容
     */
    function showDetailModal(title, content) {
        detailModalTitle.textContent = title;
        detailModalContent.textContent = content;
        detailModal.classList.add('show');
        document.body.style.overflow = 'hidden';
    }

    /**
     * 隐藏详情弹窗
     */
    function hideDetailModal() {
        detailModal.classList.remove('show');
        document.body.style.overflow = '';
    }

    /**
     * 显示编辑弹窗
     * 
     * @param {string} cardId - 卡片 ID
     * @param {string} title - 卡片标题
     * @param {string} desc - 卡片描述（HTML 格式）
     * 
     * 编辑器配置：
     *   - 两个 Quill 富文本编辑器（描述 + 教师备注）
     *   - 工具栏：加粗、斜体、下划线、删除线、引用、代码块、列表、标题、链接
     *   - 懒初始化：首次调用时创建编辑器实例
     */
    function showEditModal(cardId, title, desc) {
        currentEditingBlock = cardId;
        editBlockNameInput.value = title;

        var data = StorageManager.get('fullHierarchyData', null);
        var teacherNote = '';
        if (data) {
            var block = findBlockById(data, cardId);
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

    /**
     * 隐藏编辑弹窗
     */
    function hideEditModal() {
        currentEditingBlock = null;
        editModal.classList.remove('show');
        document.body.style.overflow = '';
    }

    /**
     * 确认编辑 - 保存修改
     * 
     * 保存内容：
     *   - title：标题文本
     *   - desc：描述（Quill HTML）
     *   - teacherNote：教师备注（Quill HTML）
     * 
     * 保存后自动刷新视图
     */
    function confirmEdit() {
        var newTitle = editBlockNameInput.value;

        if (!newTitle.trim()) {
            alert('标题不能为空');
            return;
        }

        var newDesc = window.editBlockEditorDesc ? window.editBlockEditorDesc.root.innerHTML : '';
        var newTeacher = window.editBlockEditorTeacher ? window.editBlockEditorTeacher.root.innerHTML : '';

        updateBlockData(currentEditingBlock, newTitle, newDesc, newTeacher);
        hideEditModal();

        var relationChain = StorageManager.get('relationChain', null);
        if (relationChain) {
            showRelationChain(relationChain);
        } else {
            loadBlockData();
        }
    }

    /**
     * 更新卡片数据到 localStorage
     * 
     * @param {string} cardId - 卡片 ID
     * @param {string} newTitle - 新标题
     * @param {string} newDesc - 新描述（HTML）
     * @param {string} newTeacher - 新教师备注（HTML）
     */
    function updateBlockData(cardId, newTitle, newDesc, newTeacher) {
        var data = StorageManager.get('fullHierarchyData', null);
        if (data) {
            var block = findBlockById(data, cardId);
            if (block) {
                block.title = newTitle;
                if (newDesc !== undefined) block.desc = newDesc;
                if (newTeacher !== undefined) block.teacherNote = newTeacher;
                StorageManager.set('fullHierarchyData', data);
            }
        }
    }

})();
