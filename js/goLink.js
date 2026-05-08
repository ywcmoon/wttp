/**
 * goLink.js - 探索连线页面核心脚本
 * 
 * 功能说明：
 *   1. 多层级卡片渲染（从 ls2 获取选中卡片，递归查找所有下级卡片）
 *   2. 连线模式（connect）：学生拖拽创建知识点间连线
 *   3. 对比模式（compare）：对比学生连线与教师标准答案
 *   4. 拖拽模式（drag）：卡片组整体拖拽平移 + 滚轮缩放
 *   5. 连线验证（仅允许相邻层级连线）
 *   6. 探索进度保存（正确连线数 / 总连线数）
 *   7. 详情弹窗（查看卡片标题和描述）
 * 
 * 数据存储键：
 *   - ls2：选中的卡片 ID 列表
 *   - ls1：教师标准连线数据
 *   - ls3：学生连线数据
 *   - fullHierarchyData：完整层级卡片数据
 *   - exploreProgress：探索进度记录
 * 
 * 依赖：
 *   - common.js（StorageManager）
 *   - Font Awesome（图标）
 */
(function () {
    'use strict';

    // ==================== DOM 元素引用 ====================

    /** @type {SVGSVGElement} SVG 画布，用于绘制连线 */
    var svg = document.getElementById('golink-connections-svg');

    /** @type {HTMLElement} 主工作区容器 */
    var mainContainer = document.getElementById('main-container');

    /** @type {HTMLElement} 终止探索按钮 */
    var stopBtn = document.getElementById('golink-stop-btn');

    /** @type {HTMLElement} 提交/下一步按钮 */
    var submitBtn = document.getElementById('golink-submit-btn');

    // ==================== 核心状态变量 ====================

    /** @type {Array} 连线数据数组 */
    var connections = [];

    /** @type {number} 连线 ID 自增计数器 */
    var connId = 0;

    /** @type {boolean} 是否正在拖拽创建连线 */
    var isDraggingConn = false;

    /** @type {number} 连线拖拽起始 X 坐标 */
    var startX = 0;

    /** @type {number} 连线拖拽起始 Y 坐标 */
    var startY = 0;

    /** @type {SVGGElement|null} 当前拖拽的起始连接点 */
    var curStartPt = null;

    /** @type {SVGPathElement|null} 拖拽中的临时路径 */
    var tempPath = null;

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

    /**
     * 当前模式：
     *   - 'connect'：连线模式，学生拖拽创建连线
     *   - 'compare'：对比模式，展示学生连线与教师答案的差异
     *   - 'drag'：拖拽模式，卡片组整体平移缩放
     */
    var currentMode = 'connect';

    /** @type {number} 当前缩放百分比（100 = 原始大小） */
    var currentZoom = 100;

    /** @type {boolean} 是否正在拖拽卡片组 */
    var isDraggingGroup = false;

    /** @type {number} 卡片组拖拽起始 X 坐标 */
    var dragStartXGroup = 0;

    /** @type {number} 卡片组拖拽起始 Y 坐标 */
    var dragStartYGroup = 0;

    /** @type {number} 卡片组整体 X 偏移 */
    var groupOffsetX = 0;

    /** @type {number} 卡片组整体 Y 偏移 */
    var groupOffsetY = 0;

    /** @type {number|null} 长按拖拽计时器 */
    var groupDragTimer = null;

    /** @type {boolean} 是否激活拖拽 */
    var dragActive = false;

    /** @type {number} 拖拽起始 X 坐标 */
    var dragStartX = 0;

    /** @type {number} 拖拽起始 Y 坐标 */
    var dragStartY = 0;

    // ==================== 应用初始化入口 ====================

    /**
     * DOMContentLoaded 初始化
     * 初始化按钮 → 加载渲染卡片 → 初始化弹窗 → 初始化缩放
     */
    document.addEventListener('DOMContentLoaded', function () {
        initButtons();
        loadAndRenderCards();
        initModal();
        initZoom();
        initWheelZoom();
    });

    // ==================== 按钮初始化 ====================

    /**
     * 初始化按钮事件
     * 终止探索 → 确认后清除 ls3 并返回探索列表
     * 提交按钮 → 根据当前模式切换状态
     */
    function initButtons() {
        stopBtn.addEventListener('click', function () {
            handleStopExplore();
        });

        submitBtn.addEventListener('click', function () {
            saveLs3Connections();
            handleSubmitBtn();
        });
    }

    // ==================== 终止探索 ====================

    /**
     * 终止当前探索
     * 清除学生连线数据（ls3），返回探索列表页
     */
    function handleStopExplore() {
        if (confirm('确定要终止探索吗？')) {
            StorageManager.remove('ls3');
            window.location.href = 'exploreList.html';
        }
    }

    // ==================== 提交按钮状态管理 ====================

    /**
     * 处理提交按钮的状态切换
     * 
     * 状态流转：
     *   connect（连线模式）→ compare（对比模式）→ drag（拖拽模式）→ 返回探索列表
     * 
     * 各模式行为：
     *   - connect → compare：渲染对比视图，显示图例导航
     *   - compare → drag：渲染拖拽视图
     *   - drag → 返回探索列表
     */
    function handleSubmitBtn() {
        if (currentMode === 'connect') {
            currentMode = 'compare';
            submitBtn.innerHTML = '<i class="fas fa-forward"></i> 下一步';
            renderCompareView();
            showExploreHeader();
        } else if (currentMode === 'compare') {
            currentMode = 'drag';
            submitBtn.innerHTML = '<i class="fas fa-arrow-left"></i> 继续探索';
            renderDragView();
        } else if (currentMode === 'drag') {
            window.location.href = 'exploreList.html';
        }
    }

    // ==================== 视图渲染 ====================

    /**
     * 渲染对比视图
     * 清除所有连线 → 更新连接点位置 → 渲染对比连线
     */
    function renderCompareView() {
        clearAllConnections();
        updateSvgConnectorPositions();

        var ls1 = StorageManager.get('ls1', { connections: [] });
        var ls3 = StorageManager.get('ls3', { connections: [] });

        renderCompareConnections(ls1.connections, ls3.connections);
    }

    /**
     * 渲染拖拽视图
     * 清除所有连线 → 更新连接点位置 → 渲染正确连线 → 显示缩放控件 → 启用拖拽
     */
    function renderDragView() {
        clearAllConnections();
        updateSvgConnectorPositions();

        var ls1 = StorageManager.get('ls1', { connections: [] });

        renderCorrectConnections(ls1.connections);

        showZoomIndicator();

        enableCardGroupDrag();
    }

    // ==================== 卡片组拖拽功能 ====================

    /**
     * 启用卡片组拖拽功能
     * 
     * 先移除旧事件避免重复绑定，再添加新事件：
     *   - mousedown/touchstart：开始拖拽
     *   - mousemove/touchmove：拖拽移动
     *   - mouseup/touchend/mouseleave：结束拖拽
     */
    function enableCardGroupDrag() {
        mainContainer.removeEventListener('mousedown', handleCardMouseDown);
        mainContainer.removeEventListener('touchstart', handleCardTouchStart, { passive: false });
        document.removeEventListener('mousemove', handleDragMove);
        document.removeEventListener('touchmove', handleDragMove, { passive: false });
        document.removeEventListener('mouseup', handleDragEnd);
        document.removeEventListener('touchend', handleDragEnd);
        document.removeEventListener('mouseleave', handleDragEnd);

        mainContainer.addEventListener('mousedown', handleCardMouseDown);
        mainContainer.addEventListener('touchstart', handleCardTouchStart, { passive: false });
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('touchmove', handleDragMove, { passive: false });
        document.addEventListener('mouseup', handleDragEnd);
        document.addEventListener('touchend', handleDragEnd);
        document.addEventListener('mouseleave', handleDragEnd);
    }

    /**
     * 鼠标按下 - 开始拖拽卡片组
     * 仅在拖拽模式下生效
     */
    function handleCardMouseDown(e) {
        if (currentMode !== 'drag') return;

        var card = e.target.closest('.w_contp_item');
        if (!card) return;

        e.preventDefault();
        e.stopPropagation();

        dragStartX = e.clientX - groupOffsetX;
        dragStartY = e.clientY - groupOffsetY;
        dragActive = true;
        document.querySelectorAll('.w_contp_item').forEach(function (c) {
            c.style.cursor = 'grabbing';
        });
    }

    /**
     * 触摸开始 - 开始拖拽卡片组（移动端）
     */
    function handleCardTouchStart(e) {
        if (currentMode !== 'drag') return;

        var card = e.target.closest('.w_contp_item');
        if (!card) return;

        e.preventDefault();
        e.stopPropagation();

        var touch = e.touches[0];
        dragStartX = touch.clientX - groupOffsetX;
        dragStartY = touch.clientY - groupOffsetY;
        dragActive = true;
        document.querySelectorAll('.w_contp_item').forEach(function (c) {
            c.style.cursor = 'grabbing';
        });
    }

    /**
     * 拖拽移动 - 实时更新偏移并重绘连线
     */
    function handleDragMove(e) {
        if (!dragActive || currentMode !== 'drag') {
            return;
        }

        e.preventDefault();

        var clientX = e.touches ? e.touches[0].clientX : e.clientX;
        var clientY = e.touches ? e.touches[0].clientY : e.clientY;

        groupOffsetX = clientX - dragStartX;
        groupOffsetY = clientY - dragStartY;

        applyGroupTransform();
        updateAllConnections();
    }

    /**
     * 应用卡片组 CSS transform（平移 + 缩放）
     * 以左上角为变换原点
     */
    function applyGroupTransform() {
        var golinkCont = document.querySelector('.golink-cont');
        if (golinkCont) {
            var scale = currentZoom / 100;
            golinkCont.style.transform = 'translate(' + groupOffsetX + 'px, ' + groupOffsetY + 'px) scale(' + scale + ')';
            golinkCont.style.transformOrigin = 'top left';
        }
    }

    /**
     * 初始化鼠标滚轮缩放
     * 绑定到工作区容器，passive: false 以允许 preventDefault
     */
    function initWheelZoom() {
        var container = document.getElementById('main-container');
        if (!container) return;

        container.addEventListener('wheel', handleWheelZoom, { passive: false });
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
        if (currentMode !== 'drag') return;
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

        var indicator = document.getElementById('zoom-indicator');
        if (indicator) {
            indicator.textContent = Math.round(currentZoom) + '%';
        }

        updateAllConnections();
    }

    /**
     * 拖拽结束 - 恢复鼠标样式
     */
    function handleDragEnd() {
        if (dragActive) {
            document.querySelectorAll('.w_contp_item').forEach(function (c) { c.style.cursor = 'grab'; });
        }
        dragActive = false;
    }

    // ==================== 连线对比渲染 ====================

    /**
     * 渲染教师答案与学生答案的对比连线
     * 
     * @param {Array} teacherConnections - 教师标准连线
     * @param {Array} studentConnections - 学生连线
     * 
     * 连线分类：
     *   1. 共同连线（实线 + 层级颜色）：学生答对的连线
     *   2. 教师独有（虚线 + 层级颜色）：学生漏答的连线
     *   3. 学生独有（实线 + 灰色 #909399）：学生答错的连线
     */
    function renderCompareConnections(teacherConnections, studentConnections) {
        var teacherConnectionSet = new Set(
            teacherConnections.map(function (c) { return c.startId + '-' + c.endId; })
        );
        var studentConnectionSet = new Set(
            studentConnections.map(function (c) { return c.startId + '-' + c.endId; })
        );

        teacherConnections.forEach(function (conn) {
            if (studentConnectionSet.has(conn.startId + '-' + conn.endId)) {
                renderGradientLine(conn.startId, conn.endId, 'solid');
            }
        });

        teacherConnections.forEach(function (conn) {
            if (!studentConnectionSet.has(conn.startId + '-' + conn.endId)) {
                renderGradientLine(conn.startId, conn.endId, 'dashed');
            }
        });

        studentConnections.forEach(function (conn) {
            if (!teacherConnectionSet.has(conn.startId + '-' + conn.endId)) {
                renderLine(conn.startId, conn.endId, 'solid', '#909399');
            }
        });
    }

    /**
     * 渲染正确的标准答案连线
     *
     * @param {Array} teacherConnections - 教师标准连线
     */
    function renderCorrectConnections(teacherConnections) {
        teacherConnections.forEach(function (conn) {
            renderGradientLine(conn.startId, conn.endId, 'solid');
        });
    }

    /**
     * 根据起始和结束层级获取连线颜色
     * 
     * @param {string} startId - 起始卡片 ID
     * @param {string} endId - 结束卡片 ID
     * @returns {string} 颜色值
     */
    function getLineColor(startId, endId) {
        var startLevel = startId[0].toLowerCase();
        var endLevel = endId[0].toLowerCase();

        if (startLevel === 'a' && endLevel === 'b') return '#409eff';
        if (startLevel === 'b' && endLevel === 'c') return '#67c23a';
        if (startLevel === 'c' && endLevel === 'd') return '#e6a23c';
        if (startLevel === 'd' && endLevel === 'e') return '#f56c6c';

        return '#409eff';
    }

    /**
     * 渲染单条连线
     * 
     * @param {string} startId - 起始卡片 ID
     * @param {string} endId - 结束卡片 ID
     * @param {string} style - 线型：'solid'（实线）或 'dashed'（虚线）
     * @param {string} color - 连线颜色
     */
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

    /**
     * 渲染渐变色连线
     * 创建从起始层级颜色到结束层级颜色的 SVG 渐变
     *
     * @param {string} startId - 起始卡片 ID
     * @param {string} endId - 结束卡片 ID
     * @param {string} style - 线型：'solid'（实线）或 'dashed'（虚线）
     */
    function renderGradientLine(startId, endId, style) {
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

        var startLevelKey = startId[0].toLowerCase();
        var endLevelKey = endId[0].toLowerCase();
        var levelColors = { a: '#409eff', b: '#67c23a', c: '#e6a23c', d: '#f56c6c', e: '#E372DB' };
        var c1 = levelColors[startLevelKey] || '#409eff';
        var c2 = levelColors[endLevelKey] || '#67c23a';

        var gradientId = 'grad-compare-' + startId + '-' + endId + '-' + Date.now();
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

        var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', bezier(sx, sy, ex, ey));
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', 'url(#' + gradientId + ')');
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

    /**
     * 清除所有连线
     */
    function clearAllConnections() {
        connections.forEach(function (conn) {
            if (conn.element && conn.element.parentNode) {
                conn.element.remove();
            }
        });
        connections = [];
    }

    // ==================== 缩放控件 ====================

    /**
     * 初始化缩放功能
     * 创建缩放控件（初始隐藏）
     */
    function initZoom() {
        createZoomIndicator();
        hideZoomIndicator();
    }

    /**
     * 创建缩放控件 DOM
     * 
     * 控件结构：
     *   - 减号按钮（-）：缩小 10%
     *   - 百分比显示
     *   - 加号按钮（+）：放大 10%
     * 
     * 位置：固定在页面左下角
     */
    function createZoomIndicator() {
        var zoomContainer = document.createElement('div');
        zoomContainer.id = 'zoom-control';
        zoomContainer.className = 'zoom-control';

        var containerStyles =
            'position: fixed;' +
            'bottom: 20px;' +
            'left: 20px;' +
            'display: flex;' +
            'align-items: center;' +
            'background: rgba(0,0,0,0.7);' +
            'color: white;' +
            'border-radius: 6px;' +
            'z-index: 9999;' +
            'transition: opacity 0.3s ease;';
        zoomContainer.style.cssText = containerStyles;

        var minusBtn = document.createElement('button');
        minusBtn.id = 'zoom-minus';
        minusBtn.className = 'zoom-btn';
        minusBtn.textContent = '-';
        var btnStyles =
            'background: transparent;' +
            'border: none;' +
            'color: white;' +
            'font-size: 20px;' +
            'cursor: pointer;' +
            'padding: 8px 16px;' +
            'line-height: 1;';
        minusBtn.style.cssText = btnStyles;

        var indicator = document.createElement('div');
        indicator.id = 'zoom-indicator';
        indicator.className = 'zoom-indicator';
        indicator.textContent = currentZoom + '%';
        var indicatorStyles =
            'padding: 8px 0;' +
            'min-width: 50px;' +
            'text-align: center;' +
            'font-size: 14px;' +
            'border-left: 1px solid rgba(255,255,255,0.2);' +
            'border-right: 1px solid rgba(255,255,255,0.2);';
        indicator.style.cssText = indicatorStyles;

        var plusBtn = document.createElement('button');
        plusBtn.id = 'zoom-plus';
        plusBtn.className = 'zoom-btn';
        plusBtn.textContent = '+';
        plusBtn.style.cssText = btnStyles;

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

        zoomContainer.appendChild(minusBtn);
        zoomContainer.appendChild(indicator);
        zoomContainer.appendChild(plusBtn);

        document.body.appendChild(zoomContainer);
    }

    /**
     * 显示缩放控件
     */
    function showZoomIndicator() {
        var zoomControl = document.getElementById('zoom-control');
        if (zoomControl) {
            zoomControl.style.opacity = '1';
            zoomControl.style.pointerEvents = 'auto';
        }
    }

    /**
     * 隐藏缩放控件
     */
    function hideZoomIndicator() {
        var zoomControl = document.getElementById('zoom-control');
        if (zoomControl) {
            zoomControl.style.opacity = '0';
            zoomControl.style.pointerEvents = 'none';
        }
    }

    /**
     * 设置缩放百分比
     * 
     * @param {number} percent - 缩放百分比（20~300）
     */
    function setZoom(percent) {
        currentZoom = percent;

        applyGroupTransform();

        var indicator = document.getElementById('zoom-indicator');
        if (indicator) {
            indicator.textContent = currentZoom + '%';
        }

        updateAllConnections();
    }

    /**
     * 显示顶部图例导航栏
     */
    function showExploreHeader() {
        var header = document.getElementById('explore-header');
        if (header) {
            header.style.display = 'flex';
        }
    }

    // ==================== 卡片加载与渲染 ====================

    /**
     * 加载并渲染卡片
     * 
     * 流程：
     *   1. 渲染卡片 DOM
     *   2. setTimeout 100ms 后初始化连接点
     *   3. 加载学生连线数据（ls3）
     *   4. 更新角标数字
     */
    function loadAndRenderCards() {
        renderCards();

        setTimeout(function () {
            initConnectionPoints();
            loadLs3Connections();
            updateBadges();
        }, 100);
    }

    /**
     * 渲染多层级卡片视图
     * 
     * 渲染流程：
     *   1. 清空所有层级容器
     *   2. 从 ls2 获取选中的卡片 ID
     *   3. 从 fullHierarchyData 获取完整层级数据
     *   4. 递归查找所有下级卡片（通过 connections 关系链）
     *   5. 隐藏所有层级，仅显示包含有效卡片的层级
     *   6. 按层级顺序渲染卡片
     */
    function renderCards() {
        for (var i = 1; i <= 5; i++) {
            var container = document.getElementById('golink-level-' + i + '-cards');
            if (container) {
                container.innerHTML = '';
            }
        }

        var selectedCardIds = StorageManager.get('ls2', []);

        if (!Array.isArray(selectedCardIds)) {
            selectedCardIds = ['a1'];
            StorageManager.set('ls2', selectedCardIds);
        }

        if (selectedCardIds.length === 0) {
            return;
        }

        var ls1 = StorageManager.get('ls1', {});
        var teacherConnections = ls1.connections || [];

        var fullData = StorageManager.get('fullHierarchyData', {});

        if (!fullData.level1) {
            return;
        }

        var cardIdsToShow = new Set(selectedCardIds);

        function findAllSubCards(startIds) {
            var foundNew = true;
            while (foundNew) {
                foundNew = false;
                var newCards = teacherConnections
                    .filter(function (conn) { return startIds.includes(conn.startId); })
                    .map(function (conn) { return conn.endId; });

                newCards.forEach(function (cardId) {
                    if (!cardIdsToShow.has(cardId)) {
                        cardIdsToShow.add(cardId);
                        startIds.push(cardId);
                        foundNew = true;
                    }
                });
            }
        }

        findAllSubCards(Array.from(selectedCardIds));

        for (var i = 1; i <= 5; i++) {
            var levelContainer = document.getElementById('golink-level-' + i);
            if (levelContainer) {
                levelContainer.style.display = 'none';
            }
        }

        var maxLevel = 1;
        cardIdsToShow.forEach(function (cardId) {
            var level = parseInt(cardId[1]);
            if (level > maxLevel) {
                maxLevel = level;
            }
        });

        for (var level = 1; level <= maxLevel; level++) {
            var levelKey = 'level' + level;
            var cardsInLevel = fullData[levelKey] || [];

            var cardsToRender = cardsInLevel.filter(function (card) { return cardIdsToShow.has(card.id); });

            if (cardsToRender.length > 0) {
                var lc = document.getElementById('golink-level-' + level);
                if (lc) {
                    lc.style.display = '';
                }

                cardsToRender.forEach(function (card) {
                    renderCard(card, level, maxLevel);
                });
            }
        }
    }

    /**
     * 渲染单个卡片 DOM
     * 
     * @param {Object} card - 卡片数据 {id, title, desc}
     * @param {number} level - 卡片层级（1~5）
     * @param {number} maxChainLength - 最大层级数
     * 
     * 卡片结构：
     *   - block-header：标题
     *   - block-content：描述文本 + 详情按钮
     *   - block-action-row：操作按钮行（编辑、关联子级、删除）
     *   - badge：连线数量角标（中间层级显示）
     */
    function renderCard(card, level, maxChainLength) {
        var container = document.getElementById('golink-level-' + level + '-cards');
        if (!container) return;

        var isFirstLevel = level === 1;
        var isLastLevel = level === maxChainLength;
        var levelClass = 'level-' + level;

        var cardElement = document.createElement('div');
        cardElement.className = 'w_contp_item ' + levelClass;
        cardElement.id = 'card-' + card.id;
        cardElement.setAttribute('data-card-id', card.id);
        cardElement.setAttribute('data-level', level);

        var badge = '';
        if (!isFirstLevel && !isLastLevel) {
            badge = '<div class="w_contp_inum">0</div>';
        }

        cardElement.innerHTML =
            '<div class="block-header">' +
                '<span class="block-title">' + card.title + '</span>' +
            '</div>' +
            '<div class="block-content">' +
                '<div class="block-content-text">' + card.desc + '</div>' +
                '<span class="w_contp_btn golink-more-btn" data-card-id="' + card.id + '" data-title="' + card.title + '">详情<i class="fas fa-chevron-right"></i></span>' +
            '</div>' +
            '<div class="block-action-row">' +
                '<div class="w_contp_ibtn"></div>' +
                '<div class="block-actions">' +
                    '<span class="action-btn edit-btn" title="编辑">' +
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
                    '<span class="action-btn connect-btn" title="关联子级">' +
                        '<div class="xcustomSvg">' +
                            '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                                '<path d="M4.125 5.8913C5.20931 5.56859 6 4.56413 6 3.375C6 1.92525 4.82475 0.75 3.375 0.75C1.92525 0.75 0.75 1.92525 0.75 3.375C0.75 4.56413 1.54069 5.56859 2.625 5.8913V8.52692C2.625 9.14824 3.12868 9.65192 3.75 9.65192H6.58347C6.98319 10.5913 7.91467 11.25 9 11.25C10.0853 11.25 11.0168 10.5913 11.4165 9.65192H13.875V12.1087C12.7907 12.4314 12 13.4359 12 14.625C12 16.0747 13.1753 17.25 14.625 17.25C16.0747 17.25 17.25 16.0747 17.25 14.625C17.25 13.4359 16.4593 12.4314 15.375 12.1087V9.27692C15.375 8.6556 14.8713 8.15192 14.25 8.15192H11.5825C11.3597 6.92797 10.2882 6 9 6C7.71177 6 6.64027 6.92797 6.41752 8.15192H4.125V5.8913Z" fill="#606266"></path>' +
                            '</svg>' +
                        '</div>' +
                    '</span>' +
                    '<span class="action-btn delete-btn" title="删除卡片">' +
                        '<div class="xcustomSvg">' +
                            '<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">' +
                                '<path d="M4.875 3.00049C4.875 1.75785 5.88236 0.750488 7.125 0.750488H10.875C12.1176 0.750488 13.125 1.75785 13.125 3.00049V3.93799H16.125C16.5392 3.93799 16.875 4.27377 16.875 4.68799C16.875 5.1022 16.5392 5.43799 16.125 5.43799H1.875C1.46079 5.43799 1.125 5.1022 1.125 4.68799C1.125 4.27377 1.46079 3.93799 1.875 3.93799H4.875V3.00049ZM11.625 3.75049V3.00049C11.625 2.58627 11.2892 2.25049 10.875 2.25049H7.125C6.71079 2.25049 6.375 2.58627 6.375 3.00049V3.75049H11.625ZM4.125 6.00049C4.53921 6.00049 4.875 6.33627 4.875 6.75049V14.6255C4.875 15.0397 5.21079 15.3755 5.625 15.3755H12.375C12.7892 15.3755 13.125 15.0397 13.125 14.6255V6.75049C13.125 6.33627 13.4608 6.00049 13.875 6.00049C14.2892 6.00049 14.625 6.33627 14.625 6.75049V14.6255C14.625 15.8681 13.6176 16.8755 12.375 16.8755H5.625C4.38236 16.8755 3.375 15.8681 3.375 14.6255V6.75049C3.375 6.33627 3.71079 6.00049 4.125 6.00049ZM7.5 6.75049C7.91421 6.75049 8.25 7.08627 8.25 7.50049V12.7505C8.25 13.1647 7.91421 13.5005 7.5 13.5005C7.08579 13.5005 6.75 13.1647 6.75 12.7505V7.50049C6.75 7.08627 7.08579 6.75049 7.5 6.75049ZM10.5 6.75049C10.9142 6.75049 11.25 7.08627 11.25 7.50049V12.7505C11.25 13.1647 10.9142 13.5005 10.5 13.5005C10.0858 13.5005 9.75 13.1647 9.75 12.7505V7.50049C9.75 7.08627 10.0858 6.75049 10.5 6.75049Z" fill="#606266"></path>' +
                            '</svg>' +
                        '</div>' +
                    '</span>' +
                '</div>' +
            '</div>' +
            badge;

        var moreBtn = cardElement.querySelector('.golink-more-btn');
        if (moreBtn) {
            moreBtn.addEventListener('click', function (e) {
                e.stopPropagation();
                var title = this.getAttribute('data-title');
                var content = this.closest('.w_contp_item').querySelector('.block-content-text').textContent;
                showDetailModal(title, content);
            });
        }

        container.appendChild(cardElement);
    }

    // ==================== 学生连线加载 ====================

    /**
     * 加载学生连线数据（ls3）
     * 遍历 connections 数组，逐条渲染
     */
    function loadLs3Connections() {
        try {
            var data = StorageManager.get('ls3', null);
            if (!data) return;

            if (!data.connections || data.connections.length === 0) return;

            data.connections.forEach(function (conn) {
                renderStudentConnection(conn.startId, conn.endId);
            });

            updateConnectionCounts();
        } catch (e) {
            console.error('加载 ls3 失败:', e);
        }
    }

    /**
     * 渲染单条学生连线
     * 
     * @param {string} startId - 起始卡片 ID
     * @param {string} endId - 结束卡片 ID
     * 
     * 连线样式：渐变色贝塞尔曲线（从起始层级颜色渐变到结束层级颜色）
     */
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

    // ==================== SVG 连接点初始化 ====================

    /**
     * 初始化 SVG 连接点
     * 
     * 流程：
     *   1. 清空 SVG
     *   2. 创建 defs（渐变定义容器）
     *   3. 创建连线组和连接点组
     *   4. 为每个卡片创建起始/结束连接点
     *   5. 更新连接点位置
     *   6. 绑定连线拖拽事件
     */
    function initConnectionPoints() {
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

        connectorGroup.addEventListener('mousedown', onSvgPointDown);
        connectorGroup.addEventListener('mouseup', endDrag);
        document.addEventListener('mousemove', onDrag);
        document.addEventListener('mouseup', cancelDrag);
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
     *   - 鼠标样式：crosshair（十字准星）
     */
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

            var outerCircle = info.outerCircle;
            if (outerCircle) {
                var blockId = info.dataId.replace(/-start|-end$/, '');
                var baseRadius = blockId.startsWith('a') ? 10 : 8;
                var scale = currentZoom / 100;
                outerCircle.setAttribute('r', String(baseRadius * scale));
                outerCircle.setAttribute('stroke-width', String(2 * scale));
            }

            var badgeText = element.querySelector('.svg-connector-badge-text');
            if (badgeText) {
                badgeText.setAttribute('font-size', String(10 * currentZoom / 100));
            }
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

    // ==================== 连线拖拽交互 ====================

    /**
     * SVG 连接点按下 - 开始拖拽连线
     * 仅在连线模式（connect）下生效
     * 只允许从 start 类型的连接点开始拖拽
     */
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

    /**
     * 拖拽移动 - 实时更新临时连线路径
     * 
     * 颜色渐变效果：
     *   - 拖拽距离 < 100px：保持起始层级颜色
     *   - 拖拽距离 >= 100px：颜色从起始层级渐变到下一层级
     */
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
            tempPath.style.stroke = 'rgb(' + r + ', ' + g + ', ' + b + ')';
        } else {
            tempPath.style.stroke = LEVEL_COLORS[startLevelKey] || '#409eff';
        }
    }

    /**
     * 连线拖拽结束 - 验证并创建连线
     * 
     * 验证规则：
     *   - 目标必须是 end 类型的连接点
     *   - 不能连接到自身
     *   - 层级差必须为 1（仅允许相邻层级连线）
     *   - 不能重复连线
     */
    function endDrag(e) {
        if (!isDraggingConn || !curStartPt || currentMode !== 'connect') return;
        e.preventDefault();
        e.stopPropagation();

        var target = e.target.closest('.svg-connector-point');

        if (target && target !== curStartPt) {
            var canConnect = validateConnection(curStartPt, target);

            if (canConnect) {
                var exists = connections.some(function (c) {
                    return (c.startElement === curStartPt && c.endElement === target) ||
                           (c.startElement === target && c.endElement === curStartPt);
                });

                if (!exists) {
                    createConnection(curStartPt, target);
                }
            }
        }

        cancelDrag();
    }

    /**
     * 取消连线拖拽 - 清理临时状态
     */
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

    /**
     * 验证连线是否合法
     * 
     * @param {SVGGElement} startPt - 起始连接点
     * @param {SVGGElement} endPt - 结束连接点
     * @returns {boolean} 是否合法
     * 
     * 验证条件：
     *   1. 起始和结束卡片 ID 不能为空
     *   2. 不能是同一张卡片
     *   3. 起始必须是 start 类型，结束必须是 end 类型
     *   4. 层级差必须为 1（仅允许相邻层级连线）
     */
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

    /**
     * 创建连线
     * 
     * @param {SVGGElement} startPt - 起始连接点
     * @param {SVGGElement} endPt - 结束连接点
     * 
     * 连线样式：渐变色贝塞尔曲线（从起始层级颜色渐变到结束层级颜色）
     */
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
        var sx = parseFloat(startMatch[1]);
        var sy = parseFloat(startMatch[2]);

        var endTransform = endPt.getAttribute('transform');
        var endMatch = endTransform && endTransform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (!endMatch) return;
        var ex = parseFloat(endMatch[1]);
        var ey = parseFloat(endMatch[2]);

        var startLevelKey = startBlockId[0].toLowerCase();
        var endLevelKey = endBlockId[0].toLowerCase();
        var levelColors = { a: '#409eff', b: '#67c23a', c: '#e6a23c', d: '#f56c6c', e: '#E372DB' };
        var c1 = levelColors[startLevelKey] || '#409eff';
        var c2 = levelColors[endLevelKey] || '#67c23a';

        var gradientId = 'grad-' + startBlockId + '-' + endBlockId + '-' + Date.now();
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

    // ==================== 连线数据持久化 ====================

    /**
     * 保存学生连线数据到 ls3
     * 
     * 数据结构：
     *   {
     *     connections: [{startId, endId}, ...],
     *     timestamp: ISO 时间戳
     *   }
     * 
     * 保存后同时更新探索进度
     */
    function saveLs3Connections() {
        try {
            var ls3Data = {
                connections: connections.map(function (c) {
                    return {
                        startId: c.startElement.getAttribute('data-block-id'),
                        endId: c.endElement.getAttribute('data-block-id')
                    };
                }),
                timestamp: new Date().toISOString()
            };
            StorageManager.set('ls3', ls3Data);

            saveExploreProgress();
        } catch (e) {
            console.error('保存 ls3 失败:', e);
        }
    }

    // ==================== 探索进度保存 ====================

    /**
     * 保存探索进度
     * 
     * 进度计算：
     *   1. 获取教师标准连线（ls1）
     *   2. 筛选与当前选中卡片相关的连线
     *   3. 统计学生正确连线数
     *   4. 计算进度百分比 = 正确数 / 总数 * 100
     * 
     * 保存到 exploreProgress：
     *   {
     *     [cardId]: {
     *       progress: 百分比,
     *       isCompleted: 是否完成,
     *       completedAt: 完成时间,
     *       lastUpdated: 最后更新时间,
     *       totalConnections: 总连线数,
     *       completedConnections: 已完成连线数
     *     }
     *   }
     */
    function saveExploreProgress() {
        try {
            var ls2 = StorageManager.get('ls2', []);
            if (ls2.length === 0) return;

            var ls1 = StorageManager.get('ls1', { connections: [] });
            var teacherConnections = ls1.connections || [];

            var selectedCardIds = ls2;
            var relevantTeacherConnections = getRelevantConnections(selectedCardIds, teacherConnections);

            var studentConnections = connections.map(function (c) {
                return {
                    startId: c.startElement.getAttribute('data-block-id'),
                    endId: c.endElement.getAttribute('data-block-id')
                };
            });

            var correctCount = 0;
            studentConnections.forEach(function (sc) {
                var isCorrect = relevantTeacherConnections.some(function (tc) {
                    return tc.startId === sc.startId && tc.endId === sc.endId;
                });
                if (isCorrect) correctCount++;
            });

            var totalCount = relevantTeacherConnections.length;
            var progressPercentage = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
            var isCompleted = totalCount > 0 && correctCount >= totalCount;

            var exploreProgress = StorageManager.get('exploreProgress', {});

            selectedCardIds.forEach(function (cardId) {
                exploreProgress[cardId] = {
                    progress: progressPercentage,
                    isCompleted: isCompleted,
                    completedAt: isCompleted ? new Date().toISOString() : null,
                    lastUpdated: new Date().toISOString(),
                    totalConnections: totalCount,
                    completedConnections: correctCount
                };
            });

            StorageManager.set('exploreProgress', exploreProgress);
        } catch (e) {
            console.error('保存探索进度失败:', e);
        }
    }

    /**
     * 获取与起始卡片相关的教师连线
     * 
     * @param {Array<string>} startCardIds - 起始卡片 ID 列表
     * @param {Array} allConnections - 所有教师连线
     * @returns {Array} 相关的连线数组
     * 
     * 算法：从起始卡片出发，沿连线关系链逐层查找
     */
    function getRelevantConnections(startCardIds, allConnections) {
        var relevantConnections = [];
        var processedIds = new Set(startCardIds);
        var currentIds = startCardIds.slice();

        while (currentIds.length > 0) {
            var nextIds = [];
            allConnections.forEach(function (conn) {
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

    // ==================== 连线更新 ====================

    /**
     * 更新所有连线位置
     * 先更新连接点位置，再逐条更新连线路径
     */
    function updateAllConnections() {
        updateSvgConnectorPositions();
        connections.forEach(function (c) {
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

    /**
     * 生成贝塞尔曲线路径字符串
     * 
     * @param {number} x1 - 起始 X 坐标
     * @param {number} y1 - 起始 Y 坐标
     * @param {number} x2 - 结束 X 坐标
     * @param {number} y2 - 结束 Y 坐标
     * @returns {string} SVG path d 属性值
     * 
     * 曲线形状：水平方向的 S 形曲线
     * 控制点位于起始和结束点的水平中点
     */
    function bezier(x1, y1, x2, y2) {
        var cx = (x1 + x2) / 2;
        return 'M ' + x1 + ' ' + y1 + ' C ' + cx + ' ' + y1 + ', ' + cx + ' ' + y2 + ', ' + x2 + ' ' + y2;
    }

    /**
     * 更新连线数量统计
     */
    function updateConnectionCounts() {
        updateBadges();
    }

    // ==================== 详情弹窗 ====================

    /**
     * 初始化详情弹窗事件
     * 
     * 关闭方式：
     *   - 点击关闭按钮
     *   - 点击遮罩层
     *   - 按 ESC 键
     */
    function initModal() {
        var overlay = document.getElementById('golink-modal-overlay');
        var closeBtn = document.getElementById('golink-modal-close');

        closeBtn.addEventListener('click', hideModal);
        overlay.addEventListener('click', hideModal);
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape') hideModal();
        });
    }

    /**
     * 显示详情弹窗
     * 
     * @param {string} title - 卡片标题
     * @param {string} desc - 卡片描述
     */
    function showDetailModal(title, desc) {
        var titleEl = document.getElementById('golink-modal-title');
        var descEl = document.getElementById('golink-modal-desc');
        var modal = document.getElementById('golink-detail-modal');

        titleEl.textContent = title;
        descEl.textContent = desc;

        modal.classList.add('show');
        document.body.style.overflow = 'hidden';

        var content = modal.querySelector('.golink-modal-content');
        if (content) {
            content.scrollTop = 0;
        }
    }

    /**
     * 隐藏详情弹窗
     */
    function hideModal() {
        var modal = document.getElementById('golink-detail-modal');
        modal.classList.remove('show');
        document.body.style.overflow = '';
    }

    /**
     * 窗口 resize 时更新所有连线
     */
    window.addEventListener('resize', function () {
        updateAllConnections();
    });

})();
