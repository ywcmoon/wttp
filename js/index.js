
/**
 * ======================= 问题图谱核心功能 =======================
 *
 * 功能清单：
 * 1. 拖拽连线 - 从起点拖拽到终点创建贝塞尔曲线连接
 * 2. 问题收起 - A组可折叠，折叠后下游卡片隐藏，显示堆叠副本
 * 3. 同列堆叠露头 - 折叠副本以堆叠效果展示
 * 4. 连线合并 - 折叠后多条连线合并为一条指向折叠组
 * 5. 动态更新连接数徽章 - 显示每个卡片的连接数量
 * 6. 新增卡片 - 通过弹窗输入，支持富文本描述
 * 7. 卡片编辑/删除/关联子级 - 完整的内容管理功能
 * 8. 层级管理 - 设置弹窗中可添加、编辑、删除层级
 * 9. 响应式布局 - 窗口大小变化时自动调整
 *
 * 数据结构说明：
 * - blocks: Array<HTMLElement> - 所有可拖拽卡片元素集合
 * - connections: Array<{id, startElement, endElement, element}> - 所有连接对象
 * - foldState: Map<HTMLElement, boolean> - 卡片折叠状态
 * - originalPos: Map<HTMLElement, {x, y}> - 卡片原始位置
 */

(function () {
    // 严格模式
    'use strict';

    // ==================== DOM 元素获取 ====================
    /** @type {SVGSVGElement} SVG 画布，用于绘制连接线 */
    const svg = document.getElementById('connections-svg');
    /** @type {HTMLElement} 工作区容器，用于计算布局 */
    const container = document.getElementById('main-container');

    // ==================== 核心状态变量 ====================
    /**
     * 存储所有连接对象
     * @type {Array<{id: number, startElement: HTMLElement, endElement: HTMLElement, element: SVGPathElement}>}
     */
    let connections = [];

    /** @type {number} 连接ID自增计数器，确保每个连接有唯一ID */
    let connId = 0;

    /** @type {boolean} 标记是否正在拖拽连线 */
    let isDraggingConn = false;

    /**
     * 拖拽连线时的起始点坐标和元素引用
     * @type {number} startX - 起点X坐标（SVG坐标系）
     * @type {number} startY - 起点Y坐标（SVG坐标系）
     * @type {HTMLElement} curStartPt - 当前拖拽起始连接点元素
     * @type {SVGPathElement} tempPath - 拖拽过程中的临时路径元素
     */
    let startX, startY, curStartPt = null, tempPath = null;

    /** @type {HTMLElement[]} 所有可拖拽卡片元素集合 */
    const blocks = [...document.querySelectorAll('.draggable-block')];

    /**
     * SVG 连接点映射表
     * key: blockId + '-start' 或 blockId + '-end'
     * value: { circle: SVGCircleElement, block: HTMLElement, type: 'start'|'end', dataId: string }
     */
    const svgConnectorPoints = new Map();

    /** @type {SVGGElement} SVG 连接点容器组 */
    const connectorGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    connectorGroup.setAttribute('id', 'connector-points-group');
    svg.appendChild(connectorGroup);

    const LEVEL_COLORS = {
        a: getComputedStyle(document.documentElement).getPropertyValue('--color-level-a').trim() || '#409eff',
        b: getComputedStyle(document.documentElement).getPropertyValue('--color-level-b').trim() || '#67c23a',
        c: getComputedStyle(document.documentElement).getPropertyValue('--color-level-c').trim() || '#e6a23c',
        d: getComputedStyle(document.documentElement).getPropertyValue('--color-level-d').trim() || '#f56c6c',
        e: getComputedStyle(document.documentElement).getPropertyValue('--color-level-e').trim() || '#E372DB'
    };

    // ==================== 卡片拖拽排序状态 ====================
    let isDraggingCard = false;
    let dragCardBlock = null;
    let dragGhost = null;
    let dragLongPressTimer = null;
    let dragStartX = 0, dragStartY = 0;
    let dragOffsetX = 0, dragOffsetY = 0;
    let dragTargetBlock = null;
    let suppressCardClickUntil = 0;
    const DRAG_LONG_PRESS_MS = 0;

    /**
     * 判断卡片是否为第一层级（level-1）
     * @param {HTMLElement} block - 卡片元素
     * @returns {boolean} 如果是第一层级返回 true
     */
    function isFirstLevelCard(block) {
        return !!block && block.classList.contains('level-1');
    }

    /**
     * 拖拽结束后短时间内抑制卡片点击导航
     * 防止拖拽松手时误触发卡片点击跳转
     * @returns {void}
     */
    function suppressCardNavigationAfterDrag() {
        suppressCardClickUntil = Date.now() + 500;
    }

    /**
     * 判断当前是否应该抑制卡片导航（拖拽中或拖拽刚结束）
     * @returns {boolean} 如果应抑制返回 true
     */
    function shouldSuppressCardNavigation() {
        return isDraggingCard || Date.now() < suppressCardClickUntil;
    }

    /**
     * 根据卡片ID获取SVG连接点半径
     * A组卡片连接点较大（10px），其他层级较小（8px）
     * @param {string} blockId - 卡片ID
     * @returns {number} 连接点半径（像素）
     */
    function getConnectorRadius(blockId) {
        return blockId.startsWith('a') ? 10 : 8;
    }

    /**
     * 为指定卡片创建SVG连接点（起点或终点）
     * 创建包含外圆和文字（A组起点）的SVG组元素，绑定拖拽事件
     *
     * @param {HTMLElement} block - 目标卡片元素
     * @param {string} type - 连接点类型：'start'（起点）或 'end'（终点）
     * @returns {SVGGElement} 创建的SVG组元素
     */
    function createSvgConnectorPoint(block, type) {
        const blockId = block.id;
        const dataId = `${blockId}-${type}`;
        const levelKey = blockId[0];
        const color = LEVEL_COLORS[levelKey] || '#409eff';
        const radius = getConnectorRadius(blockId);

        const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', `svg-connector-point svg-${type}-point`);
        g.setAttribute('data-id', dataId);
        g.setAttribute('data-block-id', blockId);
        g.style.cursor = 'crosshair';
        g.style.pointerEvents = 'all';

        const outerCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        outerCircle.setAttribute('r', String(radius));
        outerCircle.setAttribute('fill', type === 'start' && blockId.startsWith('a') ? color : '#fff');
        outerCircle.setAttribute('stroke', color);
        outerCircle.setAttribute('stroke-width', '2');
        outerCircle.setAttribute('class', 'svg-connector-outer');

        g.appendChild(outerCircle);

        if (type === 'start' && blockId.startsWith('a')) {
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'central');
            text.setAttribute('fill', '#fff');
            text.setAttribute('font-size', '10');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('class', 'svg-connector-badge-text');
            text.textContent = '0';
            g.appendChild(text);
        }

        g.addEventListener('mousedown', onSvgPointDown);

        connectorGroup.appendChild(g);

        svgConnectorPoints.set(dataId, {
            element: g,
            outerCircle,
            block,
            type,
            dataId
        });

        return g;
    }

    /**
     * 初始化所有SVG连接点
     * 遍历所有卡片，为非末层卡片创建起点，为非首层卡片创建终点
     * 最后更新所有连接点的位置
     * @returns {void}
     */
    function initAllSvgConnectorPoints() {
        connectorGroup.innerHTML = '';
        svgConnectorPoints.clear();

        blocks.forEach(block => {
            const blockId = block.id;
            const levelKey = blockId[0].toLowerCase();
            const isLastLevel = document.querySelectorAll('.w_contp_item.draggable-block').length > 0 &&
                (() => {
                    const cards = Array.from(document.querySelectorAll('.w_contp_item.draggable-block'));
                    const maxLevel = Math.max(...cards.map(card => {
                        const m = card.className.match(/level-(\d+)/);
                        return m ? parseInt(m[1], 10) : 1;
                    }));
                    const m = block.className.match(/level-(\d+)/);
                    const level = m ? parseInt(m[1], 10) : 1;
                    return level === maxLevel;
                })();

            if (levelKey !== 'e' && !isLastLevel) {
                createSvgConnectorPoint(block, 'start');
            }
            if (levelKey !== 'a') {
                createSvgConnectorPoint(block, 'end');
            }
        });

        updateSvgConnectorPositions();
    }

    /**
     * 更新所有SVG连接点的位置
     * 根据卡片在页面中的实际位置，计算并设置SVG连接点的坐标
     * 隐藏不可见卡片（original-hidden、无offsetParent）的连接点
     * @returns {void}
     */
    function updateSvgConnectorPositions() {
        const svgRect = svg.getBoundingClientRect();

        svgConnectorPoints.forEach((info) => {
            const { element, block, type } = info;
            if (!block) {
                element.style.display = 'none';
                return;
            }

            if (block.classList.contains('original-hidden')) {

                // 堆叠卡组的连接点
                // const nonStackedFold = document.querySelector(`.folded-block[data-source-id="${block.id}"]:not(.stacked)`);
                // const foldedBlock = nonStackedFold || document.querySelector(`.folded-block[data-source-id="${block.id}"]`);
                // if (foldedBlock && !foldedBlock.classList.contains('stacked')) {
                //     const foldGroup = foldedBlock.closest('.fold-group');
                //     const rect = foldGroup ? foldGroup.getBoundingClientRect() : foldedBlock.getBoundingClientRect();
                //     let cx, cy;
                //     if (type === 'start') {
                //         cx = rect.right - svgRect.left;
                //         cy = rect.top + rect.height / 2 - svgRect.top;
                //     } else {
                //         cx = rect.left - svgRect.left;
                //         cy = rect.top + rect.height / 2 - svgRect.top;
                //     }
                //     element.style.display = '';
                //     element.setAttribute('transform', `translate(${cx}, ${cy})`);
                //     return;
                // }
                element.style.display = 'none';
                return;
            }

            if (!block.offsetParent) {
                element.style.display = 'none';
                return;
            }

            element.style.display = '';

            const blockRect = block.getBoundingClientRect();
            let cx, cy;

            if (type === 'start') {
                cx = blockRect.right - svgRect.left;
                cy = blockRect.top + blockRect.height / 2 - svgRect.top;
            } else {
                cx = blockRect.left - svgRect.left;
                cy = blockRect.top + blockRect.height / 2 - svgRect.top;
            }

            element.setAttribute('transform', `translate(${cx}, ${cy})`);
        });
    }

    /**
     * 根据 dataId 获取SVG连接点的坐标
     * 从 SVG transform 属性中解析 translate 值
     * @param {string} dataId - 连接点标识符（格式："blockId-start" 或 "blockId-end"）
     * @returns {{x: number, y: number}} SVG坐标系中的坐标
     */
    function getSvgPointCoord(dataId) {
        const info = svgConnectorPoints.get(dataId);
        if (!info) return { x: 0, y: 0 };
        const { element } = info;
        const transform = element.getAttribute('transform');
        const match = transform && transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
        if (match) {
            return { x: parseFloat(match[1]), y: parseFloat(match[2]) };
        }
        return { x: 0, y: 0 };
    }

    /**
     * 获取所有起点类型的连接点列表
     * @returns {Array<{element: SVGGElement, outerCircle: SVGCircleElement, block: HTMLElement, type: string, dataId: string}>}
     */
    function getStartPts() {
        const pts = [];
        svgConnectorPoints.forEach((info) => {
            if (info.type === 'start') pts.push(info);
        });
        return pts;
    }

    /**
     * 存储每个卡片的原始位置（translate偏移量）
     * @type {Map<HTMLElement, {x: number, y: number}>}
     */
    const originalPos = new Map();

    /**
     * 存储每个卡片的折叠状态（true=折叠，false=展开）
     * 主要用于A组卡片的折叠/展开控制
     * @type {Map<HTMLElement, boolean>}
     */
    const foldState = new Map();

    /**
     * 存储折叠组连线（键为 "aId-targetId" 格式）
     * 用于折叠状态下合并多条连线为一条
     * @type {Map<string, SVGPathElement>}
     */
    const foldGroupLines = new Map();

    /**
     * 存储折叠前的连线路径字符串（用于恢复）
     * @type {Map<number, string>}
     */
    const connectionPaths = new Map();

    /** @type {number} 堆叠露头的垂直偏移量（像素），控制折叠副本的间距 */
    const STACK_OFFSET_Y = 28;

    // ==================== 窗口大小变化处理 ====================
    /** @type {number|null} 防抖定时器ID，用于延迟处理窗口resize事件 */
    let resizeTimer = null;

    /**
     * 更新所有连接线条的位置
     * 在窗口大小变化或布局调整时调用，确保连线跟随卡片移动
     * @returns {void}
     */
    function updateAllConnections() {
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                updateSvgConnectorPositions();
                connections.forEach(c => {
                    const s = getPointCoord(c.startElement);
                    const e = getPointCoord(c.endElement);
                    c.element.setAttribute('d', bezier(s.x, s.y, e.x, e.y));
                });

                updateAllLines();
            });
        });
    }

    /**
     * 动态更新SVG画布尺寸以适应内容
     * 计算工作区内所有元素的最大底部位置，自动调整SVG高度
     * @returns {void}
     */
    function updateSVGDimensions() {

        if (!container || !svg) return;

        const containerRect = container.getBoundingClientRect();
        const columns = container.querySelectorAll('.w_cont_problem');
        let maxBottom = 0;

        columns.forEach(col => {
            const rect = col.getBoundingClientRect();
            const bottomRelative = rect.bottom - containerRect.top;
            if (bottomRelative > maxBottom) {
                maxBottom = bottomRelative;
            }
        });

        const padding = 50;
        const requiredHeight = maxBottom + padding;
        const containerHeight = containerRect.height;

        if (requiredHeight > containerHeight) {
            svg.style.height = `${requiredHeight}px`;
        } else {
            svg.style.height = '100%';
        }
    }

    /**
     * 窗口大小变化事件处理函数（带防抖）
     * 防止窗口快速变化时频繁触发更新，造成性能问题
     * @returns {void}
     */
    function handleResize() {
        if (resizeTimer) {
            clearTimeout(resizeTimer);
        }

        resizeTimer = setTimeout(() => {
            updateSVGDimensions();
            updateAllConnections();
            resizeTimer = null;
        }, 250);
    }

    updateSVGDimensions();
    updateAllConnections();

    window.addEventListener('resize', handleResize);

    const resizeObserver = new ResizeObserver(handleResize);

    if (container) {
        resizeObserver.observe(container);
    }
    if (svg) {
        resizeObserver.observe(svg);
    }

    // ==================== 辅助函数：位置与坐标计算 ====================

    /**
     * 获取卡片当前的 translate 偏移量
     * 解析卡片的 transform 样式，获取 x 和 y 方向的偏移
     *
     * @param {HTMLElement} block - 目标卡片元素
     * @returns {{x: number, y: number}} 包含 x 和 y 偏移量的对象
     */
    function getCurrentPos(block) {
        const t = block.style.transform;
        let x = 0, y = 0;
        if (t && t !== 'none') {
            const m = t.match(/translate\(([^,]+)px,\s*([^)]+)px\)/);
            if (m) {
                x = +m[1];
                y = +m[2];
            }
        }
        return { x, y };
    }

    /**
     * 计算连接点在 SVG 坐标系中的中心坐标
     * 将页面的绝对坐标转换为 SVG 画布的相对坐标
     *
     * @param {HTMLElement} pt - 连接点元素（.start-point 或 .end-point）
     * @returns {{x: number, y: number}} SVG坐标系中的坐标
     */
    function getPointCoord(pt) {
        const dataId = pt.getAttribute && pt.getAttribute('data-id');
        if (dataId && svgConnectorPoints.has(dataId)) {
            return getSvgPointCoord(dataId);
        }
        if (pt.classList && pt.classList.contains('svg-connector-point')) {
            const did = pt.getAttribute('data-id');
            if (did) return getSvgPointCoord(did);
        }
        const r1 = svg.getBoundingClientRect();
        const r2 = pt.getBoundingClientRect();
        return {
            x: r2.left + r2.width / 2 - r1.left,
            y: r2.top + r2.height / 2 - r1.top
        };
    }

    /**
     * 生成三次贝塞尔曲线路径字符串
     * 使用水平控制点创建平滑的曲线连接
     *
     * @param {number} x1 - 起点X坐标
     * @param {number} y1 - 起点Y坐标
     * @param {number} x2 - 终点X坐标
     * @param {number} y2 - 终点Y坐标
     * @returns {string} SVG path 元素的 d 属性值
     */
    function bezier(x1, y1, x2, y2) {
        const cx = (x1 + x2) / 2;
        const bend = Math.abs(y1 - y2) < 0.1 ? 0.5 : 0;
        return `M ${x1} ${y1} C ${cx} ${y1 + bend}, ${cx} ${y2 - bend}, ${x2} ${y2}`;
    }

    /**
     * 获取折叠状态下卡片连接点的坐标
     * 优先查找指定A卡片对应的折叠副本，其次查找原始卡片，最后回退到SVG连接点
     *
     * @param {string} blockId - 卡片ID
     * @param {string} pointType - 连接点类型：'start' 或 'end'
     * @param {string} groupABlockId - 触发折叠的A卡片ID（用于定位特定折叠组）
     * @returns {{x: number, y: number}} SVG坐标系中的坐标
     */
    function getFoldedBlockCoord(blockId, pointType, groupABlockId) {
        const svgRect = svg.getBoundingClientRect();

        // 如果指定了A卡片，优先查找该A卡片对应的折叠副本
        if (groupABlockId) {
            const selector = `.folded-block[data-source-id="${blockId}"][id$="-folded-${groupABlockId}"]`;
            const foldedBlock = document.querySelector(selector);
            if (foldedBlock) {
                const foldGroup = foldedBlock.closest('.fold-group');
                if (foldGroup) {
                    const groupRect = foldGroup.getBoundingClientRect();
                    if (pointType === 'start') {
                        return { x: groupRect.right - svgRect.left, y: groupRect.top + groupRect.height / 2 - svgRect.top };
                    } else {
                        return { x: groupRect.left - svgRect.left, y: groupRect.top + groupRect.height / 2 - svgRect.top };
                    }
                }
                const blockRect = foldedBlock.getBoundingClientRect();
                if (pointType === 'start') {
                    return { x: blockRect.right - svgRect.left, y: blockRect.top + blockRect.height / 2 - svgRect.top };
                } else {
                    return { x: blockRect.left - svgRect.left, y: blockRect.top + blockRect.height / 2 - svgRect.top };
                }
            }
        }

        const originalBlock = document.getElementById(blockId);
        if (originalBlock && !originalBlock.classList.contains('original-hidden') && originalBlock.offsetParent) {
            const blockRect = originalBlock.getBoundingClientRect();
            if (pointType === 'start') {
                return { x: blockRect.right - svgRect.left, y: blockRect.top + blockRect.height / 2 - svgRect.top };
            } else {
                return { x: blockRect.left - svgRect.left, y: blockRect.top + blockRect.height / 2 - svgRect.top };
            }
        }

        const selector = groupABlockId
            ? `.folded-block[data-source-id="${blockId}"][id$="-folded-${groupABlockId}"]`
            : `.folded-block[data-source-id="${blockId}"]`;
        const foldedBlock = document.querySelector(selector);
        if (foldedBlock) {
            const foldGroup = foldedBlock.closest('.fold-group');
            if (foldGroup) {
                const groupRect = foldGroup.getBoundingClientRect();
                if (pointType === 'start') {
                    return { x: groupRect.right - svgRect.left, y: groupRect.top + groupRect.height / 2 - svgRect.top };
                } else {
                    return { x: groupRect.left - svgRect.left, y: groupRect.top + groupRect.height / 2 - svgRect.top };
                }
            }
            const blockRect = foldedBlock.getBoundingClientRect();
            if (pointType === 'start') {
                return { x: blockRect.right - svgRect.left, y: blockRect.top + blockRect.height / 2 - svgRect.top };
            } else {
                return { x: blockRect.left - svgRect.left, y: blockRect.top + blockRect.height / 2 - svgRect.top };
            }
        }

        const info = svgConnectorPoints.get(`${blockId}-${pointType}`);
        if (info) return getSvgPointCoord(`${blockId}-${pointType}`);
        return { x: 0, y: 0 };
    }

    // ==================== 连接关系查询 ====================

    /**
     * 获取指定卡片的所有下游卡片（递归查找直接和间接下游）
     * 通过 connections 数组查找所有从当前卡片出发的连接
     *
     * @param {HTMLElement} block - 起始卡片元素
     * @param {Set<HTMLElement>} visited - 已访问卡片集合（防止循环引用）
     * @returns {HTMLElement[]} 下游卡片数组
     */
    function getDownstream(block, visited = new Set()) {
        if (visited.has(block)) return [];
        visited.add(block);
        let res = [];
        connections.forEach(c => {
            const sb = getBlockFromPoint(c.startElement);
            const eb = getBlockFromPoint(c.endElement);
            if (sb === block && eb) {
                res.push(eb);
                res.push(...getDownstream(eb, visited));
            }
        });
        return res;
    }

    /**
     * 查找指定卡片的父卡片（指向当前卡片的起始卡片）
     * 用于确定卡片的上下游关系
     *
     * @param {HTMLElement} block - 目标卡片元素
     * @returns {HTMLElement|null} 父卡片元素，如果不存在则返回 null
     */
    function findParent(block) {
        for (let c of connections) {
            const eb = getBlockFromPoint(c.endElement);
            if (eb === block) return getBlockFromPoint(c.startElement);
        }
        return null;
    }

    /**
     * 判断卡片是否受到折叠影响
     * 检查当前卡片的祖先链中是否存在处于折叠状态的A组卡片
     *
     * @param {HTMLElement} block - 目标卡片元素
     * @returns {boolean} 如果受影响返回 true，否则返回 false
     */
    function isAffected(block) {
        let cur = block;
        while (cur) {
            const p = findParent(cur);
            if (!p) break;
            if (p.id.startsWith('a') && foldState.get(p) === true) return true;
            cur = p;
        }
        return false;
    }

    /**
     * 从连接点元素获取其所属的卡片元素
     * 查找方式优先级：closest查找 > data-block-id属性 > data-id映射
     *
     * @param {HTMLElement} pt - 连接点元素
     * @returns {HTMLElement|null} 所属卡片元素，未找到返回null
     */
    function getBlockFromPoint(pt) {
        if (!pt) return null;
        if (pt.closest) {
            const block = pt.closest('.draggable-block');
            if (block) return block;
        }
        const blockId = pt.getAttribute && pt.getAttribute('data-block-id');
        if (blockId) return document.getElementById(blockId);
        const dataId = pt.getAttribute && pt.getAttribute('data-id');
        if (dataId) {
            const info = svgConnectorPoints.get(dataId);
            if (info) return info.block;
        }
        return null;
    }

    // ==================== 连线管理 ====================

    /**
     * 更新所有连线（普通线 + 折叠组线）
     * 1. 遍历所有连接，根据原始卡片是否隐藏设置 visibility，并更新曲线位置
     * 2. 清除旧的折叠组连线，为每个折叠的A组重新绘制指向折叠副本的连线
     *
     * @returns {void}
     */
    function updateAllLines() {

        updateSvgConnectorPositions();

        // 遍历所有连接，更新连线的可见性和位置
        connections.forEach(c => {
            const sb = getBlockFromPoint(c.startElement);
            const eb = getBlockFromPoint(c.endElement);

            // 判断起始卡片和结束卡片是否被隐藏
            const sbHidden = sb && sb.classList.contains('original-hidden');
            const ebHidden = eb && eb.classList.contains('original-hidden');

            // 修改连线可见性的判断逻辑：
            // 只有当 sb 或 eb 被隐藏时，连线才隐藏。
            // 不要因为某个 A 组卡片折叠，就隐藏下游卡片之间的连线！
            let shouldBeVisible = !(sbHidden || ebHidden);
            // A 卡片处于折叠时，原始出线全部隐藏，由折叠组主干线接管显示
            if (sb && sb.id && sb.id.startsWith('a') && foldState.get(sb)) {
                shouldBeVisible = false;
            }

            // 设置连线的可见性（同时设置visibility属性和style，确保兼容性）
            c.element.setAttribute('visibility', shouldBeVisible ? 'visible' : 'hidden');
            c.element.style.visibility = shouldBeVisible ? 'visible' : 'hidden';



            // 更新连线的贝塞尔曲线路径
            const s = getPointCoord(c.startElement);
            const e = getPointCoord(c.endElement);
            c.element.setAttribute('d', bezier(s.x, s.y, e.x, e.y));
        });

        // 2. 清除旧的折叠组连线
        foldGroupLines.forEach(line => line.remove());
        foldGroupLines.clear();

        // 3. 为每个折叠区绘制连线（基于原始连接关系）
        // 获取所有折叠的A卡片
        const foldedABlocks = blocks.filter(b => b.id.startsWith('a') && foldState.get(b));

        foldedABlocks.forEach(aBlock => {
            const downstream = getDownstream(aBlock);

            // 构建堆叠组层级和每个层级第一层的映射
            const levelGroups = new Map();
            downstream.forEach(block => {
                const level = block.id[0];
                if (!levelGroups.has(level)) {
                    levelGroups.set(level, []);
                }
                levelGroups.get(level).push(block);
            });

            // 为每个层级排序，确保确定"第一层"的位置
            levelGroups.forEach(levelBlocks => {
                levelBlocks.sort((a, b) => getBlockSortKey(a) - getBlockSortKey(b));
            });

            // 记录每个层级的第一层
            const levelFirstBlocks = new Map();
            levelGroups.forEach((levelBlocks, level) => {
                if (levelBlocks.length > 0) {
                    levelFirstBlocks.set(level, levelBlocks[0]);
                }
            });

            // 只绘制A层到各层级第一层的连线，以及相邻层级第一层之间的连线
            const foldGroupLinesCreated = new Set();
            connections.forEach(conn => {
                const startBlock = getBlockFromPoint(conn.startElement);
                const endBlock = getBlockFromPoint(conn.endElement);

                const startInvolved = startBlock === aBlock || downstream.includes(startBlock);
                const endInvolved = downstream.includes(endBlock);

                if (!startInvolved && !endInvolved) return;

                let shouldDraw = false;

                if (startBlock === aBlock && endInvolved) {
                    const endLevel = endBlock ? endBlock.id[0] : '';
                    const firstOfLevel = levelFirstBlocks.get(endLevel);
                    if (endBlock === firstOfLevel) {
                        shouldDraw = true;
                    }
                } else if (startInvolved && endInvolved) {
                    const startLevel = startBlock ? startBlock.id[0] : '1';
                    const endLevel = endBlock ? endBlock.id[0] : '2';
                    const isAdjacentLevel = (endLevel.charCodeAt(0) - startLevel.charCodeAt(0)) === 1;
                    if (isAdjacentLevel) {
                        const firstStart = levelFirstBlocks.get(startLevel);
                        const firstEnd = levelFirstBlocks.get(endLevel);
                        if (startBlock === firstStart && endBlock === firstEnd) {
                            shouldDraw = true;
                        }
                    }
                }

                if (!shouldDraw) return;

                const s = getFoldedBlockCoord(startBlock.id, 'start', aBlock.id);
                const e = getFoldedBlockCoord(endBlock.id, 'end', aBlock.id);

                if (s.x === 0 && s.y === 0 && e.x === 0 && e.y === 0) return;

                const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');

                const startLevelNum = startBlock ? startBlock.classList[1].replace('level-', '') : '1';
                const endLevelNum = endBlock ? endBlock.classList[1].replace('level-', '') : '2';

                let lineClass = 'fold-group-line';
                if (startLevelNum === '1' && endLevelNum === '2') {
                    lineClass += ' level-1-to-level-2';
                } else if (startLevelNum === '2' && endLevelNum === '3') {
                    lineClass += ' level-2-to-level-3';
                } else if (startLevelNum === '3' && endLevelNum === '4') {
                    lineClass += ' level-3-to-level-4';
                } else if (startLevelNum === '4' && endLevelNum === '5') {
                    lineClass += ' level-4-to-level-5';
                } else {
                    lineClass += ` level-${startLevelNum}-to-level-${endLevelNum}`;
                }

                line.setAttribute('class', lineClass);
                line.setAttribute('style', 'visibility: visible;');
                line.setAttribute('d', bezier(s.x, s.y, e.x, e.y));
                svg.insertBefore(line, connectorGroup);
                const lineKey = `${conn.id}-folded-${aBlock.id}`;
                foldGroupLines.set(lineKey, line);
                foldGroupLinesCreated.add(`${aBlock.id}-${startBlock.id}-${endBlock.id}`);
            });

            // 智能堆叠连接：确保相邻层级第一层之间总是有折叠组连线
            const sortedLevels = [...levelGroups.keys()].sort();

            for (let i = 0; i < sortedLevels.length - 1; i++) {
                const currentLevel = sortedLevels[i];
                const nextLevel = sortedLevels[i + 1];

                const currentBlocks = levelGroups.get(currentLevel);
                const nextBlocks = levelGroups.get(nextLevel);

                if (currentBlocks && nextBlocks && currentBlocks.length > 0 && nextBlocks.length > 0) {
                    const firstCurrentBlock = currentBlocks[0];
                    const firstNextBlock = nextBlocks[0];

                    // 检查是否已经创建了连线
                    const pairKey = `${aBlock.id}-${firstCurrentBlock.id}-${firstNextBlock.id}`;
                    if (foldGroupLinesCreated.has(pairKey)) continue;

                    const s = getFoldedBlockCoord(firstCurrentBlock.id, 'start', aBlock.id);
                    const e = getFoldedBlockCoord(firstNextBlock.id, 'end', aBlock.id);

                    if (s.x === 0 && s.y === 0 && e.x === 0 && e.y === 0) continue;

                    const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');

                    const startLevel = firstCurrentBlock ? firstCurrentBlock.classList[1].replace('level-', '') : '1';
                    const endLevel = firstNextBlock ? firstNextBlock.classList[1].replace('level-', '') : '1';

                    let lineClass = 'fold-group-line';
                    if (startLevel === '1' && endLevel === '2') {
                        lineClass += ' level-1-to-level-2';
                    } else if (startLevel === '2' && endLevel === '3') {
                        lineClass += ' level-2-to-level-3';
                    } else if (startLevel === '3' && endLevel === '4') {
                        lineClass += ' level-3-to-level-4';
                    } else if (startLevel === '4' && endLevel === '5') {
                        lineClass += ' level-4-to-level-5';
                    } else {
                        lineClass += ` level-${startLevel}-to-level-${endLevel}`;
                    }

                    line.setAttribute('class', lineClass);
                    line.setAttribute('style', 'visibility: visible;');
                    line.setAttribute('d', bezier(s.x, s.y, e.x, e.y));
                    svg.insertBefore(line, connectorGroup);
                    foldGroupLines.set(`${firstCurrentBlock.id}-${firstNextBlock.id}-smart-${aBlock.id}`, line);
                }
            }
        });
    }

    // ==================== 核心函数：applyFold（折叠指定A卡片） ====================

    /**
     * 将指定A卡片设置为折叠状态
     * 折叠操作包括：
     * 1. 保存当前连线路径（用于恢复）
     * 2. 更新折叠按钮图标为向下箭头
     * 3. 隐藏A卡片的内容区域（只保留标题）
     * 4. 调用 updateAllFolds() 重建折叠区副本
     * 5. 更新所有连线和连接数徽章
     * 6. 将下游非堆叠节点变灰
     *
     * @param {HTMLElement} aBlock - 要折叠的A组卡片元素
     * @returns {void}
     */
    function applyFold(aBlock) {
        if (foldState.get(aBlock)) return;
        foldState.set(aBlock, true);

        connections.forEach(c => {
            connectionPaths.set(c.id, c.element.getAttribute('d'));
        });

        const toggleBtn = aBlock.querySelector('.toggle-collapse');
        if (toggleBtn) {
            toggleBtn.setAttribute('data-state', 'collapsed');
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-chevron-up');
                icon.classList.add('fa-chevron-down');
            }
        }

        const aBlockContent = aBlock.querySelector('.block-content');
        if (aBlockContent) aBlockContent.style.display = 'none';

        updateAllFolds();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                updateSvgConnectorPositions();
                updateAllLines();
                updateBadges();
            });
        });
    }

    // ==================== 核心函数：updateAllFolds ====================
    /**
     * 根据当前 foldState 状态，完全重建折叠区DOM。
     * 流程：
     * 1. 清除所有现有的折叠容器（.fold-container）。
     * 2. 恢复所有原始卡片的显示，并重置样式。
     * 3. 找出所有处于折叠状态的A卡片，获取它们的下游卡片。
     * 4. 按层级（b/c/d）和堆叠索引分组，在对应列创建折叠区容器。
     * 5. 对每个堆叠组创建折叠组（.fold-group），克隆第一个卡片作为主显示副本，
     *    其余卡片克隆为堆叠副本（.stacked），并隐藏原始卡片。
     */
    function updateAllFolds() {
        // 1. 移除所有旧折叠区
        document.querySelectorAll('.fold-container').forEach(container => container.remove());

        // 2. 恢复所有原始卡片的显示状态，但保留折叠卡片的内容隐藏
        blocks.forEach(blk => {
            blk.classList.remove('original-hidden');
            blk.classList.remove('dimmed');
            blk.style.display = '';
            blk.style.transform = '';
            blk.style.zIndex = '';

            const bc = blk.querySelector('.block-content');
            if (bc) {
                // 只有A组且处于折叠状态时才隐藏内容
                if (blk.id.startsWith('a') && foldState.get(blk)) {
                    bc.style.display = 'none';
                } else {
                    bc.style.display = '';
                }
            }
            blk.classList.remove('fold-stacked');
        });

        // 3. 获取所有折叠的A卡片
        const foldedABlocks = blocks.filter(b => b.id.startsWith('a') && foldState.get(b));
        foldedABlocks.sort((a, b) => parseInt(a.id.replace('a', '')) - parseInt(b.id.replace('a', '')));

        if (foldedABlocks.length === 0) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    updateAllLines();
                    updateBadges();
                });
            });
            return;
        }

        // 4. 按层级分组：Map<层级字母, Map<堆叠索引, { aBlock, blocks[] }>>
        const levelGroups = new Map();
        foldedABlocks.forEach((aBlk, stackIndex) => {
            const ds = getDownstream(aBlk);
            ds.forEach(blk => {
                const level = blk.id[0]; // 'b', 'c', 'd'...
                if (!levelGroups.has(level)) {
                    levelGroups.set(level, new Map());
                }
                // 类型为 Map<number, { aBlock: HTMLElement, blocks: HTMLElement[] }>。
                // 它的键是堆叠索引（stackIdx），值是包含 aBlock 和 blocks 的对象。
                const levelMap = levelGroups.get(level);

                if (!levelMap.has(stackIndex)) {
                    levelMap.set(stackIndex, { aBlock: aBlk, blocks: [] });
                }
                levelMap.get(stackIndex).blocks.push(blk);
            });
        });

        // 5. 为每个层级创建折叠区
        levelGroups.forEach((stackMap, level) => {
            const sortedStackIndices = [...stackMap.keys()].sort((a, b) => a - b);

            // 找到对应层级的容器（.w_contp_main）
            let levelContainer = null;
            const allContainers = document.querySelectorAll('.w_contp_main');
            for (const container of allContainers) {
                if (container.querySelector(`[id^="${level}"]`)) {
                    levelContainer = container;
                    break;
                }
            }
            if (!levelContainer) return;

            // 创建折叠区主容器 .fold-container
            const foldContainer = document.createElement('div');
            foldContainer.className = 'fold-container';
            levelContainer.insertBefore(foldContainer, levelContainer.firstChild); // 将折叠区容器（foldContainer）插入到指定层级列的最顶部位置         

            // 为每个堆叠索引创建折叠组
            sortedStackIndices.forEach(stackIdx => {
                // stackIdx
                // 从 stackMap.keys() 中获取并排序后的索引值。它对应于 foldedABlocks 数组的索引（即 forEach 中的 stackIndex）。
                // 因为 foldedABlocks 是按A卡片编号排序的（a1, a2, a3...），所以 stackIdx=0 对应 a1 的下游，stackIdx=1 对应 a2 的下游，以此类推。

                // stackInfo
                // 包含了当前堆叠组的元信息：
                // stackInfo.aBlock：触发该组折叠的A卡片（如 a1）。
                // stackInfo.blocks：属于当前层级（例如都是B组）且为 aBlock 下游的所有卡片（如 a1 的下游可能有 b1、b2）。

                //  blksInStack
                // 即 stackInfo.blocks 的引用，便于后续操作。它是一个数组，元素是原始卡片的DOM对象（如 b1、b2）。
                // 这些卡片在折叠后会被隐藏（添加 .original-hidden），并用克隆的折叠副本代替显示。

                const stackInfo = stackMap.get(stackIdx);
                const blksInStack = stackInfo.blocks;
                // 按卡片编号排序，确保堆叠顺序稳定：b1,b2,b3 / c1,c2,c3...
                blksInStack.sort((a, b) => getBlockSortKey(a) - getBlockSortKey(b));


                const foldGroup = document.createElement('div');
                foldGroup.className = 'fold-group';
                foldContainer.appendChild(foldGroup);

                // 第一个卡片作为主显示副本（相对定位，z-index高）
                const firstBlock = blksInStack[0];
                if (firstBlock) {
                    const clonedBlock = firstBlock.cloneNode(true);
                    clonedBlock.id = `${firstBlock.id}-folded-${stackInfo.aBlock.id}`;
                    clonedBlock.classList.add('folded-block');
                    clonedBlock.dataset.sourceId = firstBlock.id;
                    clonedBlock.classList.remove('original-hidden');  // 确保移除隐藏类

                    // 隐藏描述等细节
                    const details = clonedBlock.querySelectorAll('.w_contp_itxt, .w_contp_ibtn');
                    details.forEach(d => d.style.display = 'none');
                    const bc = clonedBlock.querySelector('.block-content');
                    if (bc) bc.style.display = 'none';

                    foldGroup.appendChild(clonedBlock);

                    // 其余卡片作为堆叠副本（绝对定位，制造露头效果）
                    for (let i = 1; i < Math.min(blksInStack.length, 3); i++) {
                        const clonedStacked = blksInStack[i].cloneNode(true);
                        clonedStacked.id = `${blksInStack[i].id}-folded-${stackInfo.aBlock.id}`;
                        clonedStacked.classList.add('folded-block', 'stacked');
                        clonedStacked.dataset.sourceId = blksInStack[i].id;
                        clonedStacked.classList.remove('original-hidden');  // 【新增】确保堆叠副本不被隐藏

                        const stackedBc = clonedStacked.querySelector('.block-content');
                        if (stackedBc) stackedBc.style.display = 'none';

                        foldGroup.appendChild(clonedStacked);
                    }
                }

                // 隐藏被折叠的原始卡片，
                // 不隐藏：检查没每一个被折叠卡片，如果卡片被其他上级（非当前折叠的A卡片）连接
                blksInStack.forEach(blk => {

                    // 只处理原始卡片，跳过克隆副本
                    if (blk.classList.contains('folded-block')) return;

                    // 使用 connections 数组检查当前卡片 blk 是否还有其他有效的上级连接
                    // connections 数组的每个元素 c 包含 startElement（起点连接点）和 endElement（终点连接点）
                    const hasOtherParent = connections.some(c => {

                        // 获取连接的终点卡片（即当前遍历的连接是否指向 blk）
                        const eb = getBlockFromPoint(c.endElement);
                        // 获取连接的起点卡片（即谁连向了 blk）
                        const sb = getBlockFromPoint(c.startElement);
                        // 如果当前连接的终点不是 blk，则跳过，不关心该连接
                        if (eb !== blk) return false;

                        // 上级已被隐藏，则该连接无效
                        // 注意：这里检查的是起点卡片(sb)是否被隐藏，不是终点卡片(eb)
                        if (sb && sb.classList.contains('original-hidden')) return false;

                        // 终点卡片被隐藏不影响连接有效性，因为我们要检查的是是否有其他上级连接
                        // 所以这里不需要检查 eb.classList.contains('original-hidden')

                        // 如果起点卡片是A组且当前处于折叠状态，则该连接对应的上级已折叠，
                        // 不应将其视为"有效的其他上级"（因为它的连接线也被合并隐藏了）
                        // 但排除当前正在处理的折叠卡片（stackInfo.aBlock），因为它的连接应该被考虑
                        if (sb && sb.id.startsWith('a') && foldState.get(sb) && sb !== stackInfo.aBlock) return false;



                        // 如果起点卡片正是触发当前折叠的A卡片（stackInfo.aBlock），
                        // 则这是“自身”的连接，不属于“其他上级”，排除
                        if (sb === stackInfo.aBlock) return false;

                        // 如果通过了以上排除条件，说明存在一个有效且未被折叠的其他上级卡片连接到了 blk
                        return true;
                    });

                    // 根据检查结果决定是否隐藏原始卡片
                    if (!hasOtherParent) {
                        // 没有其他有效的上级连接，可以安全隐藏
                        blk.classList.add('original-hidden');
                    }
                    // 如果 hasOtherParent 为 true，则不添加隐藏类，该卡片继续保持可见
                });
            });
        });

        // 在 updateAllFolds 函数的最后，updateAllLines() 调用之前添加
        document.querySelectorAll('.folded-block').forEach(el => el.classList.remove('original-hidden'));
        updateLastLevelCardUi();
    }

    /**
     * 取消折叠指定A卡片
     * @param {HTMLElement} aBlock - 要展开的A组卡片
     */
    // ==================== 核心函数：applyUnfold（展开指定A卡片） ====================

    /**
     * 将指定A卡片设置为展开状态
     * 展开操作包括：
     * 1. 重置折叠状态为 false
     * 2. 恢复A卡片的内容区域显示
     * 3. 恢复下游所有卡片的样式（移除堆叠样式、恢复内容显示）
     * 4. 移除折叠副本元素
     * 5. 更新折叠按钮图标为向上箭头
     * 6. 更新所有连线和连接数徽章
     *
     * @param {HTMLElement} aBlock - 要展开的A组卡片元素
     * @returns {void}
     */
    function applyUnfold(aBlock) {
        if (!foldState.get(aBlock)) return;
        foldState.set(aBlock, false);

        const aBlockContent = aBlock.querySelector('.block-content');
        if (aBlockContent) aBlockContent.style.display = 'block';

        const ds = getDownstream(aBlock);
        ds.forEach(child => {
            child.classList.remove('fold-stacked');
            const details = child.querySelectorAll('.w_contp_itxt, .w_contp_ibtn');
            details.forEach(d => d.style.display = 'block');
            const cc = child.querySelector('.block-content');
            if (cc) cc.style.display = 'block';
        });

        updateAllFolds();
        updateSvgConnectorPositions();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                updateAllLines();
                updateBadges();
            });
        });

        const toggleBtn = aBlock.querySelector('.toggle-collapse');
        if (toggleBtn) {
            toggleBtn.setAttribute('data-state', 'expanded');
            const icon = toggleBtn.querySelector('i');
            if (icon) {
                icon.classList.remove('fa-chevron-down');
                icon.classList.add('fa-chevron-up');
            }
        }
    }

    /**
     * 切换折叠/展开状态
     * @param {HTMLElement} block - 目标卡片（一般为A组）
     */
    /**
     * 切换卡片的折叠/展开状态
     * 根据当前折叠状态调用 applyFold 或 applyUnfold
     *
     * @param {HTMLElement} block - 目标卡片元素（通常为A组卡片）
     * @returns {void}
     */
    function toggleFold(block) {
        foldState.get(block) ? applyUnfold(block) : applyFold(block);
    }

    // ==================== 连接数徽章更新 ====================

    /**
     * 更新所有卡片的连接数徽章
     * - A组连接点：在连接点内部直接显示数字
     * - 其他组：更新右上角的 .w_contp_inum 徽章
     *
     * @returns {void}
     */
    function updateBadges() {
        document.querySelectorAll('.connection-badge').forEach(b => b.remove());
        const map = new Map();
        const startPtsList = getStartPts();
        startPtsList.forEach(info => map.set(info.dataId, 0));
        connections.forEach(c => {
            const sDataId = c.startElement.getAttribute('data-id') ||
                (getBlockFromPoint(c.startElement) ? getBlockFromPoint(c.startElement).id + '-start' : null);
            if (sDataId && map.has(sDataId)) {
                map.set(sDataId, map.get(sDataId) + 1);
            }
        });
        map.forEach((cnt, dataId) => {
            const info = svgConnectorPoints.get(dataId);
            if (!info) return;
            const block = info.block;
            if (block && block.id.startsWith('a')) {
                const textEl = info.element.querySelector('.svg-connector-badge-text');
                if (textEl) textEl.textContent = cnt;
            } else if (block) {
                const badge = block.querySelector('.w_contp_inum');
                if (badge) badge.textContent = cnt;
            }
        });
    }

    // ========== 连线有效性验证 ==========
    /**
     * 验证连接是否有效：只允许相邻层级（差值为1）之间的连接
     * @param {HTMLElement} sp - 起始连接点
     * @param {HTMLElement} ep - 结束连接点
     * @returns {boolean}
     */
    // ==================== 连线有效性验证 ====================

    /**
     * 验证连接是否有效
     * 验证规则：
     * 1. 起点和终点必须属于不同的卡片
     * 2. 不能存在重复的连接（同一对起点和终点）
     * 3. 只允许相邻层级之间的连接（层级差值为1）
     * 4. 必须从起点(start-point)连接到终点(end-point)
     * 5. 只允许正向连接（层级A->B, B->C, C->D, D->E），禁止逆向
     *
     * @param {HTMLElement} sp - 起始连接点元素
     * @param {HTMLElement} ep - 终点连接点元素
     * @returns {boolean} 如果连接有效返回 true，否则返回 false
     */
    function isValid(sp, ep) {
        const sb = getBlockFromPoint(sp);
        const eb = getBlockFromPoint(ep);
        if (!sb || !eb) return false;

        const existingConnection = connections.some(conn => {
            return (conn.startElement === sp && conn.endElement === ep) ||
                (conn.startElement === ep && conn.endElement === sp);
        });
        if (existingConnection) return false;

        const sg = sb.id[0].toUpperCase(), eg = eb.id[0].toUpperCase();
        const diff = Math.abs(sg.charCodeAt(0) - eg.charCodeAt(0));

        const isStartToEnd = sp.classList.contains('start-point') && ep.classList.contains('end-point');
        const isForward = sg.charCodeAt(0) < eg.charCodeAt(0);

        return diff === 1 && isStartToEnd && isForward;
    }

    // ==================== 拖拽连线事件处理 ====================

    /**
     * 开始拖拽连线的事件处理函数
     * 当用户按下连接点时触发，记录起始位置和元素
     *
     * @param {MouseEvent} e - 鼠标事件对象
     * @returns {void}
     */
    function onPointDown(e) {
        e.preventDefault(); e.stopPropagation();
        const startBlock = getBlockFromPoint(e.currentTarget);
        // 折叠状态下禁止拖拽连线
        if (startBlock && foldState.get(startBlock) === true) return;

        isDraggingConn = true;
        document.body.classList.add('is-connecting');
        curStartPt = e.currentTarget;
        const c = getPointCoord(curStartPt);
        startX = c.x; startY = c.y;

        tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        // 获取起始卡片的层级
        const startLevel = startBlock ? startBlock.classList[1].replace('level-', '') : '1';

        // 设置临时线条的渐变色类（默认使用起始层级的颜色）
        let tempPathClass = 'path-line';
        if (startLevel === '1') {
            tempPathClass += ' level-1-to-level-1';
        } else if (startLevel === '2') {
            tempPathClass += ' level-2-to-level-2';
        } else if (startLevel === '3') {
            tempPathClass += ' level-3-to-level-3';
        } else if (startLevel === '4') {
            tempPathClass += ' level-4-to-level-4';
        } else if (startLevel === '5') {
            tempPathClass += ' level-5-to-level-5';
        }

        tempPath.setAttribute('class', tempPathClass);
        tempPath.setAttribute('d', bezier(startX, startY, startX, startY));
        svg.insertBefore(tempPath, connectorGroup);

        document.addEventListener('mousemove', onConnDrag);
        document.addEventListener('mouseup', onConnEnd);
    }

    /**
     * SVG连接点按下事件处理
     * 从SVG组元素启动连线拖拽
     *
     * @param {MouseEvent} e - 鼠标事件对象
     * @returns {void}
     */
    function onSvgPointDown(e) {
        e.preventDefault(); e.stopPropagation();
        const g = e.currentTarget;
        const blockId = g.getAttribute('data-block-id');
        const block = document.getElementById(blockId);
        if (block && foldState.get(block) === true) return;

        isDraggingConn = true;
        document.body.classList.add('is-connecting');
        curStartPt = g;
        const dataId = g.getAttribute('data-id');
        const c = getSvgPointCoord(dataId);
        startX = c.x; startY = c.y;

        tempPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');

        const startLevel = block ? (block.className.match(/level-(\d+)/) || [])[1] || '1' : '1';
        const pointType = g.classList.contains('svg-start-point') ? 'start' : 'end';

        let tempPathClass = 'path-line';
        if (pointType === 'start') {
            tempPathClass += ` level-${startLevel}-to-level-${startLevel}`;
        } else {
            const prevLevel = String(Math.max(1, parseInt(startLevel, 10) - 1));
            tempPathClass += ` level-${prevLevel}-to-level-${startLevel}`;
        }

        tempPath.setAttribute('class', tempPathClass);
        tempPath.setAttribute('d', bezier(startX, startY, startX, startY));
        svg.insertBefore(tempPath, connectorGroup);

        document.addEventListener('mousemove', onConnDrag);
        document.addEventListener('mouseup', onSvgConnEnd);
    }

    /**
     * 拖拽连线过程中的事件处理函数
     * 实时更新临时路径的终点位置，并根据拖拽长度应用渐变色效果
     *
     * @param {MouseEvent} e - 鼠标事件对象
     * @returns {void}
     */
    function onConnDrag(e) {
        if (!isDraggingConn) return;
        const r = svg.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;
        tempPath.setAttribute('d', bezier(startX, startY, x, y));

        const dragLength = Math.sqrt(Math.pow(x - startX, 2) + Math.pow(y - startY, 2));
        const thresholdLength = 100;

        if (dragLength >= thresholdLength) {
            let startBlock = null;
            let startLevel = '1';
            startBlock = getBlockFromPoint(curStartPt);
            startLevel = startBlock ? (startBlock.className.match(/level-(\d+)/) || [])[1] || '1' : '1';

            const progress = Math.min((dragLength - thresholdLength) / 100, 1);

            if (startLevel === '1') {
                tempPath.style.stroke = `rgb(${(255 - progress * 100)}, ${(200 + progress * 55)}, ${(255 - progress * 200)})`;
            } else if (startLevel === '2') {
                // 从绿色到橙色渐变
                tempPath.style.stroke = `rgb(${(103 + progress * 100)}, ${(194 - progress * 100)}, ${(58 + progress * 100)})`;
            } else if (startLevel === '3') {
                // 从橙色到红色渐变
                tempPath.style.stroke = `rgb(${(230 - progress * 100)}, ${(162 - progress * 100)}, ${(60 + progress * 100)})`;
            } else if (startLevel === '4') {
                // 从红色到紫色渐变
                tempPath.style.stroke = `rgb(${(245 - progress * 100)}, ${(108 + progress * 100)}, ${(108 + progress * 100)})`;
            }
        }
    }

    /**
     * 结束拖拽连线的事件处理函数
     * 当用户释放鼠标时触发，验证连接并创建正式的连接线
     *
     * @param {MouseEvent} e - 鼠标事件对象
     * @returns {void}
     */
    function onConnEnd(e) {
        if (!isDraggingConn) return;
        document.removeEventListener('mousemove', onConnDrag);
        document.removeEventListener('mouseup', onConnEnd);

        const r = svg.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;

        let targetPt = document.elementFromPoint(e.clientX, e.clientY);
        if (targetPt && !targetPt.classList.contains('connector-point')) {
            targetPt = targetPt.closest('.connector-point');
        }
        if (!targetPt) {
            if (curStartPt.classList.contains('end-point')) {
                const allStartPoints = document.querySelectorAll('.start-point');
                for (let pt of allStartPoints) {
                    const rect = pt.getBoundingClientRect();
                    if (e.clientX >= rect.left && e.clientX <= rect.right &&
                        e.clientY >= rect.top && e.clientY <= rect.bottom) {
                        targetPt = pt;
                        break;
                    }
                }
            } else {
                const allEndPoints = document.querySelectorAll('.end-point');
                for (let pt of allEndPoints) {
                    const rect = pt.getBoundingClientRect();
                    if (e.clientX >= rect.left && e.clientX <= rect.right &&
                        e.clientY >= rect.top && e.clientY <= rect.bottom) {
                        targetPt = pt;
                        break;
                    }
                }
            }
        }

        if (targetPt && targetPt !== curStartPt) {
            const isStartToEnd = curStartPt.classList.contains('start-point') && targetPt.classList.contains('end-point');
            const isEndToStart = curStartPt.classList.contains('end-point') && targetPt.classList.contains('start-point');

            if ((isStartToEnd || isEndToStart) && isValid(curStartPt, targetPt)) {
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

                const startBlock = getBlockFromPoint(curStartPt);
                const endBlock = getBlockFromPoint(targetPt);
                const startLevel = startBlock ? (startBlock.className.match(/level-(\d+)/) || [])[1] || '1' : '1';
                const endLevel = endBlock ? (endBlock.className.match(/level-(\d+)/) || [])[1] || '1' : '1';

                let pathClass = 'path-line';
                if (startLevel === '1' && endLevel === '2') {
                    pathClass += ' level-1-to-level-2';
                } else if (startLevel === '2' && endLevel === '3') {
                    pathClass += ' level-2-to-level-3';
                } else if (startLevel === '3' && endLevel === '4') {
                    pathClass += ' level-3-to-level-4';
                } else if (startLevel === '4' && endLevel === '5') {
                    pathClass += ' level-4-to-level-5';
                } else {
                    pathClass += ` level-${startLevel}-to-level-${endLevel}`;
                }

                path.setAttribute('class', pathClass);

                const endCoord = getPointCoord(targetPt);
                path.setAttribute('d', bezier(startX, startY, endCoord.x, endCoord.y));
                svg.insertBefore(path, connectorGroup);

                connections.push({
                    id: connId++,
                    startElement: curStartPt,
                    endElement: targetPt,
                    element: path
                });

                path.addEventListener('mouseenter', onPathMouseEnter);
                path.addEventListener('mouseleave', onPathMouseLeave);
                updateBadges();
                saveToLocalStorage(); // 保存连线到 localStorage
            }
        }

        tempPath.remove();
        isDraggingConn = false;
        document.body.classList.remove('is-connecting');
        curStartPt = null;
        tempPath = null;
    }

    /**
     * SVG连接点连线拖拽结束事件
     * 检测释放位置是否命中有效目标连接点，创建连线或取消
     *
     * @param {MouseEvent} e - 鼠标事件对象
     * @returns {void}
     */
    function onSvgConnEnd(e) {
        if (!isDraggingConn) return;
        document.removeEventListener('mousemove', onConnDrag);
        document.removeEventListener('mouseup', onSvgConnEnd);

        const r = svg.getBoundingClientRect();
        const x = e.clientX - r.left;
        const y = e.clientY - r.top;

        let targetInfo = null;
        const elUnder = document.elementFromPoint(e.clientX, e.clientY);
        if (elUnder) {
            const g = elUnder.closest('.svg-connector-point');
            if (g) {
                const tid = g.getAttribute('data-id');
                targetInfo = svgConnectorPoints.get(tid);
            }
        }

        if (!targetInfo) {
            svgConnectorPoints.forEach((info) => {
                if (targetInfo) return;
                const { element } = info;
                if (element.style.display === 'none') return;
                const transform = element.getAttribute('transform');
                const match = transform && transform.match(/translate\(([^,]+),\s*([^)]+)\)/);
                if (!match) return;
                const cx = parseFloat(match[1]);
                const cy = parseFloat(match[2]);
                const radius = getConnectorRadius(info.block.id);
                const dist = Math.sqrt(Math.pow(x - cx, 2) + Math.pow(y - cy, 2));
                if (dist <= radius + 4) {
                    targetInfo = info;
                }
            });
        }

        const startDataId = curStartPt.getAttribute('data-id');
        const startInfo = svgConnectorPoints.get(startDataId);

        if (targetInfo && targetInfo !== startInfo && startInfo) {
            const isStartToEnd = startInfo.type === 'start' && targetInfo.type === 'end';
            const isEndToStart = startInfo.type === 'end' && targetInfo.type === 'start';

            if (isStartToEnd || isEndToStart) {
                const startBlock = startInfo.block;
                const endBlock = targetInfo.block;
                const sg = startBlock.id[0].toUpperCase();
                const eg = endBlock.id[0].toUpperCase();
                const diff = Math.abs(sg.charCodeAt(0) - eg.charCodeAt(0));
                const isForward = sg.charCodeAt(0) < eg.charCodeAt(0);

                const existingConnection = connections.find(conn => {
                    const connStartId = conn.startElement.getAttribute('data-id') || (getBlockFromPoint(conn.startElement) || {}).id + '-start';
                    const connEndId = conn.endElement.getAttribute('data-id') || (getBlockFromPoint(conn.endElement) || {}).id + '-end';
                    return connStartId === startDataId && connEndId === targetInfo.dataId;
                });

                if (diff === 1 && ((isStartToEnd && isForward) || (isEndToStart && !isForward)) && !existingConnection) {
                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

                    let actualStartBlock, actualEndBlock, actualStartPt, actualEndPt;
                    if (isStartToEnd && isForward) {
                        actualStartBlock = startBlock;
                        actualEndBlock = endBlock;
                        actualStartPt = curStartPt;
                        actualEndPt = targetInfo.element;
                    } else {
                        actualStartBlock = endBlock;
                        actualEndBlock = startBlock;
                        actualStartPt = targetInfo.element;
                        actualEndPt = curStartPt;
                    }

                    const actualStartLevel = (actualStartBlock.className.match(/level-(\d+)/) || [])[1] || '1';
                    const actualEndLevel = (actualEndBlock.className.match(/level-(\d+)/) || [])[1] || '1';

                    let pathClass = 'path-line';
                    if (actualStartLevel === '1' && actualEndLevel === '2') {
                        pathClass += ' level-1-to-level-2';
                    } else if (actualStartLevel === '2' && actualEndLevel === '3') {
                        pathClass += ' level-2-to-level-3';
                    } else if (actualStartLevel === '3' && actualEndLevel === '4') {
                        pathClass += ' level-3-to-level-4';
                    } else if (actualStartLevel === '4' && actualEndLevel === '5') {
                        pathClass += ' level-4-to-level-5';
                    } else {
                        pathClass += ` level-${actualStartLevel}-to-level-${actualEndLevel}`;
                    }

                    path.setAttribute('class', pathClass);

                    const actualStartCoord = getSvgPointCoord(actualStartPt.getAttribute('data-id'));
                    const actualEndCoord = getSvgPointCoord(actualEndPt.getAttribute('data-id'));
                    path.setAttribute('d', bezier(actualStartCoord.x, actualStartCoord.y, actualEndCoord.x, actualEndCoord.y));
                    svg.insertBefore(path, connectorGroup);

                    connections.push({
                        id: connId++,
                        startElement: actualStartPt,
                        endElement: actualEndPt,
                        element: path
                    });

                    path.addEventListener('mouseenter', onPathMouseEnter);
                    path.addEventListener('mouseleave', onPathMouseLeave);
                    updateBadges();
                    saveToLocalStorage();
                }
            }
        }

        tempPath.remove();
        isDraggingConn = false;
        document.body.classList.remove('is-connecting');
        curStartPt = null;
        tempPath = null;
    }
    // ==================== 连线悬停删除按钮 ====================

    /**
     * 鼠标进入连线时显示删除按钮
     * 在连线中点创建一个红色圆形按钮和十字图标
     *
     * @param {MouseEvent} e - 鼠标事件对象
     * @returns {void}
     */
    function onPathMouseEnter(e) {
        removeDeleteBtn();
        const path = e.target;
        if (!path.classList.contains('path-line')) return;
        if (path.classList.contains('hidden')) return;
        if (path.getAttribute('visibility') === 'hidden' || path.style.visibility === 'hidden') return;
        const pathLength = path.getTotalLength();
        const midPoint = path.getPointAtLength(pathLength / 2);

        const deleteBtn = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        deleteBtn.setAttribute('class', 'path-delete-btn');
        deleteBtn.setAttribute('cx', midPoint.x);
        deleteBtn.setAttribute('cy', midPoint.y);
        deleteBtn.setAttribute('r', 12);
        deleteBtn.setAttribute('fill', '#f56c6c');
        deleteBtn.setAttribute('cursor', 'pointer');
        deleteBtn.setAttribute('pointer-events', 'all');

        const cross = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        cross.setAttribute('class', 'path-delete-cross');
        cross.setAttribute('d', 'M-4,-4 L4,4 M4,-4 L-4,4');
        cross.setAttribute('stroke', '#fff');
        cross.setAttribute('stroke-width', 2);
        cross.setAttribute('transform', `translate(${midPoint.x}, ${midPoint.y})`);
        cross.setAttribute('cursor', 'pointer');
        cross.setAttribute('pointer-events', 'all');

        svg.appendChild(deleteBtn);
        svg.appendChild(cross);

        const handleDelete = (ev) => {
            ev.stopPropagation();
            const conn = connections.find(c => c.element === path);
            if (conn) {
                svg.removeChild(conn.element);
                connections = connections.filter(c => c.id !== conn.id);
                updateBadges();
                saveToLocalStorage(); // 删除连线后也保存
            }
            removeDeleteBtn();
        };

        deleteBtn.addEventListener('click', handleDelete);
        cross.addEventListener('click', handleDelete);
    }

    /**
     * 移除所有连线上的删除按钮（红色圆圈和叉号）
     * @returns {void}
     */
    function removeDeleteBtn() {
        document.querySelectorAll('.path-delete-btn').forEach(btn => btn.remove());
        document.querySelectorAll('.path-delete-cross').forEach(cross => cross.remove());
    }

    /**
     * 获取所有折叠A卡片的下游卡片集合
     * 用于判断卡片是否属于某个折叠组
     * @returns {Set<HTMLElement>} 所有被折叠影响的卡片集合
     */
    function getCollapsedDownstreamSet() {
        const set = new Set();
        blocks.filter(b => b.id.startsWith('a') && foldState.get(b)).forEach(a => {
            getDownstream(a).forEach(n => set.add(n));
        });
        return set;
    }

    /**
     * 从指定卡片向上查找第一个可见的根卡片（未被折叠的A卡片）
     * 在折叠状态下用于确定卡片的有效上级
     *
     * @param {HTMLElement} block - 起始卡片
     * @param {Set<HTMLElement>} excluded - 排除的卡片集合
     * @returns {HTMLElement|null} 第一个可见的A卡片，未找到返回null
     */
    function findTopVisibleRoot(block, excluded) {
        const visited = new Set();
        const queue = [block];
        while (queue.length) {
            const cur = queue.shift();
            if (!cur || visited.has(cur)) continue;
            visited.add(cur);
            if (cur.id && cur.id.startsWith('a') && !foldState.get(cur) && !excluded.has(cur)) {
                return cur;
            }
            connections.forEach(conn => {
                const sb = getBlockFromPoint(conn.startElement);
                const eb = getBlockFromPoint(conn.endElement);
                if (eb === cur && sb && !excluded.has(sb) && !visited.has(sb)) {
                    queue.push(sb);
                }
            });
        }
        return null;
    }

    /**
     * 同步SVG连接点与当前卡片列表
     * 根据层级数量动态为卡片添加或移除起始连接点
     * 末层卡片自动移除起始连接点，非末层卡片自动创建
     * @returns {void}
     */
    function syncConnectorPoints() {
        const maxLevel = levels.length;
        if (maxLevel === 0) return;
        blocks.forEach(block => {
            const blockId = block.id;
            const levelKey = blockId[0].toLowerCase();
            const m = block.className.match(/level-(\d+)/);
            const level = m ? parseInt(m[1], 10) : 1;
            const isLastLevel = level === maxLevel;
            const dataId = blockId + '-start';
            if (levelKey !== 'e' && !isLastLevel) {
                // 非末层且无起始连接点 → 创建
                if (!svgConnectorPoints.has(dataId)) {
                    createSvgConnectorPoint(block, 'start');
                }
            } else if (svgConnectorPoints.has(dataId)) {
                // 末层且已有起始连接点 → 移除
                const info = svgConnectorPoints.get(dataId);
                if (info.element && info.element.parentNode) {
                    info.element.remove();
                }
                svgConnectorPoints.delete(dataId);
            }
        });
        updateSvgConnectorPositions();
    }

    /**
     * 更新最新最低层级的右侧连接点，关联子级操作按钮
     * @returns {void}
     */
    function updateLastLevelCardUi() {
        const cards = Array.from(document.querySelectorAll('.w_contp_item.draggable-block'));
        if (!cards.length) return;
        const maxLevel = levels.length > 0 ? levels.length : Math.max(...cards.map(card => {
            const m = card.className.match(/level-(\d+)/);
            return m ? parseInt(m[1], 10) : 1;
        }));
        cards.forEach(card => {
            const m = card.className.match(/level-(\d+)/);
            const level = m ? parseInt(m[1], 10) : 1;
            const isLast = level === maxLevel;
            const startInfo = svgConnectorPoints.get(`${card.id}-start`);
            if (startInfo) startInfo.element.style.display = isLast ? 'none' : '';
            const badge = card.querySelector('.w_contp_inum');
            const connectBtn = card.querySelector('.connect-btn');
            if (badge) badge.style.display = isLast ? 'none' : '';
            if (connectBtn) connectBtn.style.display = isLast ? 'none' : '';
        });
    }

    /**
     * 鼠标移出连线时延迟移除删除按钮
     * 延迟150ms防止鼠标快速移动时按钮闪烁
     * @param {MouseEvent} e - 鼠标事件对象
     * @returns {void}
     */
    function onPathMouseLeave(e) {
        setTimeout(() => removeDeleteBtn(), 150);
    }

    /**
     * 更新所有层级标题的卡片数量显示
     * 实时统计每个层级下的卡片数量并显示在标题中
     * @returns {void}
     */
    function updateLevelTitles() {
        // 更新所有层级标题的卡片数量
        document.querySelectorAll('.w_cont_problem').forEach(column => {
            const colId = getColumnIdentifier(column);
            const blockCount = blocks.filter(b => b.id.startsWith(colId)).length;
            const title = column.querySelector('.w_contp_txt');
            if (title) {
                const levelName = title.textContent.replace(/（\d+）$/, '').trim();
                title.textContent = `${levelName}（${blockCount}）`;
            }
        });
    }

    // ==================== 初始化基础事件 ====================

    /**
     * 初始化基础事件监听
     * 为所有连接点和连线绑定事件处理器
     *
     * @returns {void}
     */
    function init() {
        initAllSvgConnectorPoints();
        document.querySelectorAll('.path-line').forEach(path => {
            path.addEventListener('mouseenter', onPathMouseEnter);
            path.addEventListener('mouseleave', onPathMouseLeave);
        });

        // 对A层卡片的折叠按钮
        blocks.filter(b => b.id.startsWith('a')).forEach(b => {
            const toggleBtn = b.querySelector('.toggle-collapse');
            if (toggleBtn) {
                toggleBtn.setAttribute('data-state', 'expanded');

                toggleBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleFold(b);
                });

            }
        });

        updateLevelTitles();

        // 初始化按钮事件
        initButtonEvents();
    }

    /**
     * 初始化默认折叠状态：所有第一层卡片默认全部收起
     * @returns {void}
     */
    function foldsAllCard() {
        const allABlocks = blocks.filter(b => b.id.startsWith('a'));

        allABlocks.forEach(b => {
            if (!foldState.get(b)) {
                foldState.set(b, true);
                const toggleBtn = b.querySelector('.toggle-collapse');
                if (toggleBtn) {
                    toggleBtn.setAttribute('data-state', 'collapsed');
                    const icon = toggleBtn.querySelector('i');
                    if (icon) {
                        icon.classList.remove('fa-chevron-up');
                        icon.classList.add('fa-chevron-down');
                    }
                }
                const aBlockContent = b.querySelector('.block-content');
                if (aBlockContent) aBlockContent.style.display = 'none';
            }
        });

        updateAllFolds();

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                updateAllLines();
                updateBadges();
            });
        });
    }

    /**
     * 初始化按钮事件
     * @returns {void}
     */
    function initButtonEvents() {
        // 全部展开按钮
        const expandAllBtn = document.getElementById('expand-all-btn');
        if (expandAllBtn) {
            expandAllBtn.addEventListener('click', () => {
                expandAll();
            });
        }

        // 批量导入按钮
        const batchImportBtn = document.getElementById('batch-import-btn');
        if (batchImportBtn) {
            batchImportBtn.addEventListener('click', () => {
                showImportModal();
            });
        }

        // 一键导出按钮
        const exportBtn = document.getElementById('export-btn');
        if (exportBtn) {
            exportBtn.addEventListener('click', () => {
                handleExport();
            });
        }

        // 批量删除按钮
        const batchDeleteBtn = document.getElementById('batch-delete-btn');
        if (batchDeleteBtn) {
            batchDeleteBtn.addEventListener('click', () => {
                expandAll();
                enterDeleteMode();

            });
        }

        // 删除确认弹窗按钮
        const deleteConfirmBtnConfirm = document.getElementById('delete-confirm-btn-confirm');
        if (deleteConfirmBtnConfirm) {
            deleteConfirmBtnConfirm.addEventListener('click', () => {
                hideDeleteConfirmModal();
                executeDelete();
            });
        }

        const deleteConfirmBtnCancel = document.getElementById('delete-confirm-btn-cancel');
        if (deleteConfirmBtnCancel) {
            deleteConfirmBtnCancel.addEventListener('click', () => {
                hideDeleteConfirmModal();
            });
        }

        const deleteConfirmModalClose = document.getElementById('delete-confirm-modal-close');
        if (deleteConfirmModalClose) {
            deleteConfirmModalClose.addEventListener('click', () => {
                hideDeleteConfirmModal();
            });
        }

        // 导入弹窗相关
        const importModalOverlay = document.getElementById('import-modal-overlay');
        const importModalClose = document.getElementById('import-modal-close');
        const importBtnCancel = document.getElementById('import-btn-cancel');
        const importBtnConfirm = document.getElementById('import-btn-confirm');

        if (importModalClose) {
            importModalClose.addEventListener('click', hideImportModal);
        }
        if (importBtnCancel) {
            importBtnCancel.addEventListener('click', hideImportModal);
        }
        if (importModalOverlay) {
            importModalOverlay.addEventListener('click', (e) => {
                if (e.target === importModalOverlay) {
                    hideImportModal();
                }
            });
        }
        if (importBtnConfirm) {
            importBtnConfirm.addEventListener('click', () => {
                handleImport();
            });
        }

        // 批量删除弹窗相关
        const cancelDeleteBtn = document.getElementById('cancel-delete-btn');
        const confirmDeleteBtn = document.getElementById('confirm-delete-btn');
        const selectAllCheckbox = document.getElementById('select-all-checkbox');

        if (cancelDeleteBtn) {
            cancelDeleteBtn.addEventListener('click', () => {
                exitDeleteMode();
            });
        }
        if (confirmDeleteBtn) {
            confirmDeleteBtn.addEventListener('click', () => {

                showDeleteConfirmModal();
            });
        }
        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', () => {
                toggleSelectAll();
            });
        }
    }

    /**
     * 全部展开功能
     * @returns {void}
     */
    function expandAll() {
        const foldedABlocks = blocks.filter(b => b.id.startsWith('a') && foldState.get(b));
        foldedABlocks.forEach(b => {
            foldState.set(b, false);
            const aBlockContent = b.querySelector('.block-content');
            if (aBlockContent) aBlockContent.style.display = 'block';
            const ds = getDownstream(b);
            ds.forEach(child => {
                child.classList.remove('fold-stacked');
                const details = child.querySelectorAll('.w_contp_itxt, .w_contp_ibtn');
                details.forEach(d => d.style.display = 'block');
                const cc = child.querySelector('.block-content');
                if (cc) cc.style.display = 'block';
            });
            const toggleBtn = b.querySelector('.toggle-collapse');
            if (toggleBtn) {
                toggleBtn.setAttribute('data-state', 'expanded');
                const icon = toggleBtn.querySelector('i');
                if (icon) {
                    icon.classList.remove('fa-chevron-down');
                    icon.classList.add('fa-chevron-up');
                }
            }
        });

        updateAllFolds();
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                updateAllLines();
                updateBadges();
            });
        });
    }

    /**
     * 显示导入弹窗
     * @returns {void}
     */
    function showImportModal() {
        const modal = document.getElementById('import-modal-overlay');
        if (modal) {
            modal.classList.remove('hidden');
        }
    }

    /**
     * 隐藏导入弹窗
     * @returns {void}
     */
    function hideImportModal() {
        const modal = document.getElementById('import-modal-overlay');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * 处理导入
     * @returns {void}
     */
    function handleImport() {
        const fileInput = document.getElementById('import-file');
        if (fileInput && fileInput.files.length > 0) {
            const file = fileInput.files[0];
            // 这里可以添加处理Excel导入的代码
            alert('已选择文件: ' + file.name + '，导入功能开发中...');
            hideImportModal();
        } else {
            alert('请先选择文件');
        }
    }

    /**
     * 处理导出
     * @returns {void}
     */
    function handleExport() {
        const link = document.createElement('a');
        link.href = 'source/问题图谱导出.xlsx';
        link.download = '问题图谱导出.xlsx';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }

    // 批量删除模式状态
    let deleteMode = false;
    let selectedCards = new Set();

    /**
     * 进入批量删除模式
     */
    function enterDeleteMode() {
        deleteMode = true;
        selectedCards.clear();

        // 隐藏原始导航栏，显示删除导航栏
        document.getElementById('original-w_head').style.display = 'none';
        document.getElementById('delete-mode-head').style.display = 'flex';

        // 为每个卡片添加删除勾选框
        addDeleteCheckboxes();

        // 更新数量显示
        updateCardCount();

        updateSelectedCount();
    }

    /**
     * 退出批量删除模式
     */
    function exitDeleteMode() {
        deleteMode = false;
        selectedCards.clear();

        // 显示原始导航栏，隐藏删除导航栏
        document.getElementById('original-w_head').style.display = '';
        document.getElementById('delete-mode-head').style.display = 'none';

        // 移除删除勾选框
        removeDeleteCheckboxes();
    }

    /**
     * 为每个卡片添加删除勾选框
     */
    function addDeleteCheckboxes() {
        const allCards = document.querySelectorAll('.w_contp_item.draggable-block');

        allCards.forEach(card => {
            // 隐藏A组卡片的折叠图标
            const toggleCollapse = card.querySelector('.toggle-collapse');
            if (toggleCollapse) {
                toggleCollapse.style.display = 'none';
            }

            // 隐藏其他卡片的连接数字
            const connectionNum = card.querySelector('.w_contp_inum');
            if (connectionNum) {
                connectionNum.style.display = 'none';
            }

            // 添加勾选框
            if (!card.querySelector('.delete-checkbox')) {
                const checkbox = document.createElement('span');
                checkbox.className = 'delete-checkbox';
                checkbox.innerHTML = '<i class="fas fa-square"></i>';

                const cardId = card.id;
                checkbox.addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleCardSelection(cardId);
                });

                card.insertBefore(checkbox, card.firstChild);
            }
        });
    }

    /**
     * 移除删除勾选框
     */
    function removeDeleteCheckboxes() {
        const allCards = document.querySelectorAll('.w_contp_item.draggable-block');

        allCards.forEach(card => {
            // 显示A组卡片的折叠图标
            const toggleCollapse = card.querySelector('.toggle-collapse');
            if (toggleCollapse) {
                toggleCollapse.style.display = '';
            }

            // 显示其他卡片的连接数字
            const connectionNum = card.querySelector('.w_contp_inum');
            if (connectionNum) {
                connectionNum.style.display = '';
            }

            // 移除勾选框
            const checkbox = card.querySelector('.delete-checkbox');
            if (checkbox) {
                checkbox.remove();
            }

            // 移除选中样式
            card.classList.remove('selected-card');
        });
    }

    /**
     * 切换卡片选中状态
     */
    function toggleCardSelection(cardId) {
        if (selectedCards.has(cardId)) {
            selectedCards.delete(cardId);
        } else {
            selectedCards.add(cardId);
        }

        // 更新显示
        const card = document.getElementById(cardId);
        const checkbox = card.querySelector('.delete-checkbox');

        if (selectedCards.has(cardId)) {
            checkbox.innerHTML = '<i class="fas fa-check-square"></i>';
            card.classList.add('selected-card');
        } else {
            checkbox.innerHTML = '<i class="fas fa-square"></i>';
            card.classList.remove('selected-card');
        }

        updateSelectedCount();
        updateSelectAllCheckbox();
    }

    /**
     * 更新卡片总数显示
     */
    function updateCardCount() {
        const allCards = document.querySelectorAll('.w_contp_item.draggable-block');
        const countElement = document.querySelector('.delete-mode-head .card-count');
        if (countElement) {
            countElement.textContent = `[${allCards.length}]个问题`;
        }
    }

    /**
     * 更新已选中卡片数量显示
     */
    function updateSelectedCount() {
        const countElement = document.querySelector('.delete-mode-head .selected-count');
        if (countElement) {

            countElement.textContent = `，已选中[${selectedCards.size}]`;
        }
    }

    /**
     * 更新全选复选框状态
     */
    function updateSelectAllCheckbox() {
        const allCards = document.querySelectorAll('.w_contp_item.draggable-block');
        const selectAllCheckbox = document.getElementById('select-all-checkbox');

        if (selectedCards.size === allCards.length) {
            selectAllCheckbox.checked = true;
        } else {
            selectAllCheckbox.checked = false;
        }
    }

    /**
     * 全选/取消全选
     */
    function toggleSelectAll() {
        const selectAllCheckbox = document.getElementById('select-all-checkbox');
        const allCards = document.querySelectorAll('.w_contp_item.draggable-block');

        if (selectAllCheckbox.checked) {
            // 全选
            allCards.forEach(card => {
                if (!selectedCards.has(card.id)) {
                    toggleCardSelection(card.id);
                }
            });
        } else {
            // 取消全选
            allCards.forEach(card => {
                if (selectedCards.has(card.id)) {
                    toggleCardSelection(card.id);
                }
            });
        }
    }

    /**
     * 显示删除确认弹窗
     */
    function showDeleteConfirmModal() {

        const modal = document.getElementById('delete-confirm-modal-overlay');
        if (modal) {
            // 更新弹窗中的提示文字
            const modalBody = modal.querySelector('.modal-body p');
            if (modalBody) {
                modalBody.textContent = `确定要删除 ${selectedCards.size} 个卡片吗？`;
            }
            modal.classList.remove('hidden');
        }
    }

    /**
     * 隐藏删除确认弹窗
     */
    function hideDeleteConfirmModal() {
        const modal = document.getElementById('delete-confirm-modal-overlay');
        if (modal) {
            modal.classList.add('hidden');
        }
    }

    /**
     * 执行删除操作
     */
    function executeDelete() {
        // 删除选中的卡片
        selectedCards.forEach(cardId => {
            const card = document.getElementById(cardId);
            if (card) {
                // 删除相关的连接
                deleteCardConnections(cardId);

                // 从 blocks 数组中移除
                const index = blocks.findIndex(b => b.id === cardId);
                if (index !== -1) {
                    blocks.splice(index, 1);
                }

                // 删除卡片
                card.remove();
            }
        });

        // 保存到 localStorage
        saveToLocalStorage();

        // 退出删除模式
        exitDeleteMode();
    }



    /**
     * 删除指定卡片相关的所有连接（SVG连线）
     * 遍历connections数组，移除与目标卡片ID相关的所有连线DOM和引用
     *
     * @param {string} cardId - 要删除连接的卡片ID
     * @returns {void}
     */
    function deleteCardConnections(cardId) {
        const newConnections = connections.filter(conn => {
            const startBlock = getBlockFromPoint(conn.startElement);
            const endBlock = getBlockFromPoint(conn.endElement);
            const startId = startBlock ? startBlock.id : null;
            const endId = endBlock ? endBlock.id : null;

            if (startId === cardId || endId === cardId) {
                // 移除连线 DOM
                conn.element.remove();
                return false;
            }
            return true;
        });

        connections = newConnections;
    }

    // ==================== 新增卡片功能（弹窗 + 富文本） ====================
    /** @type {HTMLElement} 当前点击添加的列容器 */
    let currentColumn = null;
    /** @type {Quill} 描述富文本编辑器实例 */
    let editorDesc = null;
    /** @type {Quill} 教师参考富文本编辑器实例 */
    let editorTeacher = null;
    /** @type {Object} 卡片ID计数器（记录各列当前最大编号） */
    let blockIdCounter = { a: 3, b: 4, c: 4, d: 1 };

    /**
     * 初始化 Quill 富文本编辑器
     * 用于卡片描述和教师参考的富文本编辑
     *
     * @returns {void}
     */
    function initEditors() {
        editorDesc = new Quill('#block-desc', {
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
        editorTeacher = new Quill('#block-teacher', {
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

    /**
     * 根据列容器获取对应的层级标识字母
     * @param {HTMLElement} column - 列容器 .w_cont_problem
     * @returns {string} 层级标识字母 'a','b','c','d','e'
     */
    function getColumnIdentifier(column) {
        if (column.classList.contains('ABox')) return 'a';
        if (column.classList.contains('BBox')) return 'b';
        if (column.classList.contains('CBox')) return 'c';
        if (column.classList.contains('DBox')) return 'd';
        if (column.classList.contains('EBox')) return 'e';
        return 'a';
    }

    /**
     * 根据层级字母获取对应的 CSS 样式类
     * @param {string} colId - 层级标识字母 'a','b','c','d','e'
     * @returns {string} CSS 样式类名 'level-1' 到 'level-5'
     */
    function getLevelClass(colId) {
        const levelMap = { 'a': 1, 'b': 2, 'c': 3, 'd': 4, 'e': 5 };
        return `level-${levelMap[colId]}`;
    }

    /**
     * 卡片排序键：按字母层级 + 数字编号
     * @param {HTMLElement} block
     * @returns {number}
     */
    function getBlockSortKey(block) {
        if (!block || !block.id) return Number.MAX_SAFE_INTEGER;
        const letter = block.id[0].toLowerCase();
        const num = parseInt(block.id.slice(1), 10) || 0;
        return (letter.charCodeAt(0) - 97) * 10000 + num;
    }

    /**
     * 判断富文本 HTML 是否有实际内容（过滤空标签）
     * @param {string} html
     * @returns {boolean}
     */
    function hasMeaningfulHtml(html) {
        if (!html) return false;
        const div = document.createElement('div');
        div.innerHTML = html;
        const text = (div.textContent || '').replace(/\s+/g, '').trim();
        const hasMedia = !!div.querySelector('img,video,iframe,table,ul,ol,li,blockquote,pre,code');
        return text.length > 0 || hasMedia;
    }

    /**
     * 统一操作按钮图标结构
     * 主要用于第二层旧卡片与其他层按钮样式对齐
     */
    function normalizeActionButtonIcons() {
        const iconMap = {
            edit: `<div class="xcustomSvg"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3.11727 11.8925L11.0722 3.9375L13.4587 6.32399L5.50376 14.2789L2.9913 15.1164C2.55156 15.263 2.13321 14.8446 2.27978 14.4049L3.11727 11.8925Z" fill="#606266"></path><path d="M11.8677 3.142L12.2655 2.74426C12.9245 2.08525 13.9929 2.08525 14.652 2.74426C15.311 3.40327 15.311 4.47173 14.652 5.13074L14.2542 5.52849L11.8677 3.142Z" fill="#606266"></path><path d="M10.4474 13.926H9.09744V15.276H10.4474V13.926Z" fill="#606266"></path><path d="M13.3725 13.926H12.0225V15.276H13.3725V13.926Z" fill="#606266"></path><path d="M14.9469 13.926H16.2969V15.276H14.9469V13.926Z" fill="#606266"></path></svg></div>`,
            connect: `<div class="xcustomSvg"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.125 5.8913C5.20931 5.56859 6 4.56413 6 3.375C6 1.92525 4.82475 0.75 3.375 0.75C1.92525 0.75 0.75 1.92525 0.75 3.375C0.75 4.56413 1.54069 5.56859 2.625 5.8913V8.52692C2.625 9.14824 3.12868 9.65192 3.75 9.65192H6.58347C6.98319 10.5913 7.91467 11.25 9 11.25C10.0853 11.25 11.0168 10.5913 11.4165 9.65192H13.875V12.1087C12.7907 12.4314 12 13.4359 12 14.625C12 16.0747 13.1753 17.25 14.625 17.25C16.0747 17.25 17.25 16.0747 17.25 14.625C17.25 13.4359 16.4593 12.4314 15.375 12.1087V9.27692C15.375 8.6556 14.8713 8.15192 14.25 8.15192H11.5825C11.3597 6.92797 10.2882 6 9 6C7.71177 6 6.64027 6.92797 6.41752 8.15192H4.125V5.8913Z" fill="#606266"></path></svg></div>`,
            delete: `<div class="xcustomSvg"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4.875 3.00049C4.875 1.75785 5.88236 0.750488 7.125 0.750488H10.875C12.1176 0.750488 13.125 1.75785 13.125 3.00049V3.93799H16.125C16.5392 3.93799 16.875 4.27377 16.875 4.68799C16.875 5.1022 16.5392 5.43799 16.125 5.43799H1.875C1.46079 5.43799 1.125 5.1022 1.125 4.68799C1.125 4.27377 1.46079 3.93799 1.875 3.93799H4.875V3.00049ZM11.625 3.75049V3.00049C11.625 2.58627 11.2892 2.25049 10.875 2.25049H7.125C6.71079 2.25049 6.375 2.58627 6.375 3.00049V3.75049H11.625ZM4.125 6.00049C4.53921 6.00049 4.875 6.33627 4.875 6.75049V14.6255C4.875 15.0397 5.21079 15.3755 5.625 15.3755H12.375C12.7892 15.3755 13.125 15.0397 13.125 14.6255V6.75049C13.125 6.33627 13.4608 6.00049 13.875 6.00049C14.2892 6.00049 14.625 6.33627 14.625 6.75049V14.6255C14.625 15.8681 13.6176 16.8755 12.375 16.8755H5.625C4.38236 16.8755 3.375 15.8681 3.375 14.6255V6.75049C3.375 6.33627 3.71079 6.00049 4.125 6.00049ZM7.5 6.75049C7.91421 6.75049 8.25 7.08627 8.25 7.50049V12.7505C8.25 13.1647 7.91421 13.5005 7.5 13.5005C7.08579 13.5005 6.75 13.1647 6.75 12.7505V7.50049C6.75 7.08627 7.08579 6.75049 7.5 6.75049ZM10.5 6.75049C10.9142 6.75049 11.25 7.08627 11.25 7.50049V12.7505C11.25 13.1647 10.9142 13.5005 10.5 13.5005C10.0858 13.5005 9.75 13.1647 9.75 12.7505V7.50049C9.75 7.08627 10.0858 6.75049 10.5 6.75049Z" fill="#606266"></path></svg></div>`
        };

        document.querySelectorAll('.action-btn').forEach(btn => {
            if (btn.querySelector('.xcustomSvg')) return;
            if (btn.classList.contains('edit-btn')) btn.innerHTML = iconMap.edit;
            else if (btn.classList.contains('connect-btn')) btn.innerHTML = iconMap.connect;
            else if (btn.classList.contains('delete-btn')) btn.innerHTML = iconMap.delete;
        });
    }

    /**
     * 创建新卡片的 DOM 元素
     * 根据层级创建带有不同连接点的卡片（起点、终点、徽章等）
     *
     * @param {string} colId - 层级标识字母 'a','b','c','d','e'
     * @param {string} name - 卡片标题
     * @param {string} desc - 描述内容（HTML）
     * @param {string} teacher - 教师参考内容（HTML）
     * @returns {HTMLElement} 创建的卡片 DOM 元素
     */
    function createBlock(colId, name, desc, teacher) {
        blockIdCounter[colId]++;
        const newId = `${colId}${blockIdCounter[colId]}`;
        const levelClass = getLevelClass(colId);

        const block = document.createElement('div');
        block.className = `w_contp_item ${levelClass} draggable-block`;
        block.id = newId;

        const toggleBtn = colId === 'a' ? `<span class="toggle-collapse" data-state="expanded"><i class="fas fa-chevron-up"></i></span>` : '';
 
        let badge = '';
        let connectBtn = '';
        // 获取所有层级，动态判断最低层级
        const allColumns = document.querySelectorAll('.w_cont_problem');
        const levelIds = Array.from(allColumns).map(col => getColumnIdentifier(col));
        const minLevel = levelIds.length > 0 ? levelIds.sort()[0] : 'a';
        const maxLevel = levelIds.length > 0 ? levelIds.sort()[levelIds.length - 1] : 'e';
        
        if (colId !== minLevel && colId !== maxLevel) {
            badge = `<div class="w_contp_inum">0</div>`;
            connectBtn = `<span class="action-btn connect-btn" title="关联子级">
                        <div class="xcustomSvg">
                            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M4.125 5.8913C5.20931 5.56859 6 4.56413 6 3.375C6 1.92525 4.82475 0.75 3.375 0.75C1.92525 0.75 0.75 1.92525 0.75 3.375C0.75 4.56413 1.54069 5.56859 2.625 5.8913V8.52692C2.625 9.14824 3.12868 9.65192 3.75 9.65192H6.58347C6.98319 10.5913 7.91467 11.25 9 11.25C10.0853 11.25 11.0168 10.5913 11.4165 9.65192H13.875V12.1087C12.7907 12.4314 12 13.4359 12 14.625C12 16.0747 13.1753 17.25 14.625 17.25C16.0747 17.25 17.25 16.0747 17.25 14.625C17.25 13.4359 16.4593 12.4314 15.375 12.1087V9.27692C15.375 8.6556 14.8713 8.15192 14.25 8.15192H11.5825C11.3597 6.92797 10.2882 6 9 6C7.71177 6 6.64027 6.92797 6.41752 8.15192H4.125V5.8913Z" fill="#606266"></path>
                            </svg>
                        </div>
                    </span>`;
        }

        block.innerHTML = `
                    <div class="block-header">
                        <span class="block-title">${name}</span>
                        ${toggleBtn}
                    </div>
                    <div class="block-content">
                        <div class="block-content-text">${desc ? desc : '新内容'}</div>
                        <span class="w_contp_btn">详情<i class="fas fa-chevron-right"></i></span>
                    </div>
                    <div class="block-action-row">
                        <div class="w_contp_ibtn">
                        </div>
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
                            ${connectBtn}
                            <span class="action-btn delete-btn" title="删除卡片">
                                <div class="xcustomSvg">
                                    <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M4.875 3.00049C4.875 1.75785 5.88236 0.750488 7.125 0.750488H10.875C12.1176 0.750488 13.125 1.75785 13.125 3.00049V3.93799H16.125C16.5392 3.93799 16.875 4.27377 16.875 4.68799C16.875 5.1022 16.5392 5.43799 16.125 5.43799H1.875C1.46079 5.43799 1.125 5.1022 1.125 4.68799C1.125 4.27377 1.46079 3.93799 1.875 3.93799H4.875V3.00049ZM11.625 3.75049V3.00049C11.625 2.58627 11.2892 2.25049 10.875 2.25049H7.125C6.71079 2.25049 6.375 2.58627 6.375 3.00049V3.75049H11.625ZM4.125 6.00049C4.53921 6.00049 4.875 6.33627 4.875 6.75049V14.6255C4.875 15.0397 5.21079 15.3755 5.625 15.3755H12.375C12.7892 15.3755 13.125 15.0397 13.125 14.6255V6.75049C13.125 6.33627 13.4608 6.00049 13.875 6.00049C14.2892 6.00049 14.625 6.33627 14.625 6.75049V14.6255C14.625 15.8681 13.6176 16.8755 12.375 16.8755H5.625C4.38236 16.8755 3.375 15.8681 3.375 14.6255V6.75049C3.375 6.33627 3.71079 6.00049 4.125 6.00049ZM7.5 6.75049C7.91421 6.75049 8.25 7.08627 8.25 7.50049V12.7505C8.25 13.1647 7.91421 13.5005 7.5 13.5005C7.08579 13.5005 6.75 13.1647 6.75 12.7505V7.50049C6.75 7.08627 7.08579 6.75049 7.5 6.75049ZM10.5 6.75049C10.9142 6.75049 11.25 7.08627 11.25 7.50049V12.7505C11.25 13.1647 10.9142 13.5005 10.5 13.5005C10.0858 13.5005 9.75 13.1647 9.75 12.7505V7.50049C9.75 7.08627 10.0858 6.75049 10.5 6.75049Z" fill="#606266"></path>
                                    </svg>
                                </div>
                            </span>
                        </div>
                    </div>
                    <div class="w_block_btns"> 
                        <div class="w_teachbtn" style="display: none;">教师参考</div>
                    </div>
                    ${badge}
                `;
        return block;
    }

    // ==================== 卡片拖拽排序功能 ====================

    /**
     * 绑定卡片拖拽手柄事件
     * 长按手柄触发拖拽，设置短距离移动容差防止误触
     *
     * @param {HTMLElement} block - 卡片元素
     * @param {HTMLElement} dragHandle - 拖拽手柄元素
     * @returns {void}
     */
    function bindCardDragHandle(block, dragHandle) {
        dragHandle.addEventListener('mousedown', (e) => {
            if (!isFirstLevelCard(block)) return;
            e.preventDefault();
            e.stopPropagation();
            dragStartX = e.clientX;
            dragStartY = e.clientY;
            dragCardBlock = block;
            dragLongPressTimer = setTimeout(() => {
                startCardDrag(block, e);
            }, DRAG_LONG_PRESS_MS);

            const cancelLongPress = (ev) => {
                if (Math.abs(ev.clientX - dragStartX) > 5 || Math.abs(ev.clientY - dragStartY) > 5) {
                    clearTimeout(dragLongPressTimer);
                    document.removeEventListener('mousemove', cancelLongPress);
                }
            };
            document.addEventListener('mousemove', cancelLongPress);
            document.addEventListener('mouseup', () => {
                clearTimeout(dragLongPressTimer);
                document.removeEventListener('mousemove', cancelLongPress);
            }, { once: true });
        });
    }

    /**
     * 为卡片添加拖拽手柄
     * 仅在首层级卡片上显示拖拽手柄，非首层级移除已有手柄
     *
     * @param {HTMLElement} block - 卡片元素
     * @returns {void}
     */
    function addCardDragHandle(block) {
        if (!isFirstLevelCard(block)) {
            block.querySelectorAll('.card-drag-handle').forEach(handle => handle.remove());
            return;
        }
        if (block.querySelector('.card-drag-handle')) return;

        const dragHandle = document.createElement('div');
        dragHandle.className = 'card-drag-handle';
        dragHandle.innerHTML = '<svg width="14" height="14" viewBox="0 0 14 14" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="4" cy="3" r="1.5" fill="#909399"/><circle cx="10" cy="3" r="1.5" fill="#909399"/><circle cx="4" cy="7" r="1.5" fill="#909399"/><circle cx="10" cy="7" r="1.5" fill="#909399"/><circle cx="4" cy="11" r="1.5" fill="#909399"/><circle cx="10" cy="11" r="1.5" fill="#909399"/></svg>';
        dragHandle.title = '长按拖拽排序';
        block.appendChild(dragHandle);
        bindCardDragHandle(block, dragHandle);
    }

    /**
     * 开始卡片拖拽
     * 创建拖拽幽灵元素并启动鼠标跟随
     *
     * @param {HTMLElement} block - 被拖拽的卡片
     * @param {MouseEvent} e - 鼠标事件
     * @returns {void}
     */
    function startCardDrag(block, e) {
        if (!isFirstLevelCard(block)) return;
        isDraggingCard = true;
        document.body.style.userSelect = 'none';

        const rect = block.getBoundingClientRect();
        dragOffsetX = e.clientX - rect.left;
        dragOffsetY = e.clientY - rect.top;

        dragGhost = block.cloneNode(true);
        dragGhost.className = 'card-drag-ghost';
        dragGhost.style.width = rect.width + 'px';
        dragGhost.style.left = (e.clientX - dragOffsetX) + 'px';
        dragGhost.style.top = (e.clientY - dragOffsetY) + 'px';
        document.body.appendChild(dragGhost);

        block.classList.add('card-dragging');

        document.addEventListener('mousemove', onCardDragMove);
        document.addEventListener('mouseup', onCardDragEnd);
    }

    /**
     * 卡片拖拽中（鼠标跟随）
     * 实时更新幽灵元素位置，检测目标卡片并高亮
     *
     * @param {MouseEvent} e - 鼠标事件
     * @returns {void}
     */
    function onCardDragMove(e) {
        if (!isDraggingCard || !dragGhost || !dragCardBlock) return;

        dragGhost.style.left = (e.clientX - dragOffsetX) + 'px';
        dragGhost.style.top = (e.clientY - dragOffsetY) + 'px';

        const sameLevelBlocks = blocks.filter(b => isFirstLevelCard(b) && b !== dragCardBlock && !b.classList.contains('folded-block'));

        let newTarget = null;
        for (const b of sameLevelBlocks) {
            const r = b.getBoundingClientRect();
            if (e.clientY >= r.top && e.clientY <= r.bottom) {
                newTarget = b;
                break;
            }
        }

        if (dragTargetBlock && dragTargetBlock !== newTarget) {
            dragTargetBlock.classList.remove('card-drop-target');
        }
        if (newTarget) {
            newTarget.classList.add('card-drop-target');
        }
        dragTargetBlock = newTarget;
    }

    /**
     * 卡片拖拽结束
     * 清理拖拽状态，若命中有效目标则交换位置
     *
     * @param {MouseEvent} e - 鼠标事件
     * @returns {void}
     */
    function onCardDragEnd(e) {
        clearTimeout(dragLongPressTimer);
        document.removeEventListener('mousemove', onCardDragMove);
        document.removeEventListener('mouseup', onCardDragEnd);

        if (!isDraggingCard) return;
        suppressCardNavigationAfterDrag();

        if (dragTargetBlock && dragCardBlock) {
            swapCardPositions(dragCardBlock, dragTargetBlock);
        }

        if (dragCardBlock) {
            dragCardBlock.classList.remove('card-dragging');
        }
        if (dragTargetBlock) {
            dragTargetBlock.classList.remove('card-drop-target');
        }
        if (dragGhost) {
            dragGhost.remove();
            dragGhost = null;
        }

        isDraggingCard = false;
        dragCardBlock = null;
        dragTargetBlock = null;
        document.body.style.userSelect = '';
    }

    /**
     * 交换两个卡片的位置（在第一层级内拖拽排序）
     * 交换两个同级卡片在DOM中的位置，并更新SVG连接和保存状态
     *
     * @param {HTMLElement} blockA - 被拖拽的卡片
     * @param {HTMLElement} blockB - 目标位置卡片
     * @returns {void}
     */
    function swapCardPositions(blockA, blockB) {
        if (!isFirstLevelCard(blockA) || !isFirstLevelCard(blockB)) return;
        const parentA = blockA.parentNode;
        const parentB = blockB.parentNode;

        if (parentA !== parentB) return;

        const siblingA = blockA.nextSibling;
        const siblingB = blockB.nextSibling;

        if (siblingA === blockB) {
            parentA.insertBefore(blockB, blockA);
        } else if (siblingB === blockA) {
            parentA.insertBefore(blockA, blockB);
        } else {
            const refNodeA = siblingA;
            parentA.insertBefore(blockA, siblingB);
            parentA.insertBefore(blockB, refNodeA);
        }

        const idxA = blocks.indexOf(blockA);
        const idxB = blocks.indexOf(blockB);
        if (idxA !== -1 && idxB !== -1) {
            blocks[idxA] = blockB;
            blocks[idxB] = blockA;
        }

        updateSvgConnectorPositions();
        updateAllConnections();
        saveToLocalStorage();
    }

    // ==================== 模态框控制函数 ====================

    /**
     * 显示新增卡片弹窗
     * @param {HTMLElement} column - 当前操作的列容器
     * @returns {void}
     */
    function showModal(column) {
        currentColumn = column;
        document.getElementById('modal-overlay').classList.remove('hidden');
        document.getElementById('block-name').value = '';
        if (editorDesc) editorDesc.setContents([]);
        if (editorTeacher) editorTeacher.setContents([]);
        document.getElementById('block-name').focus();
    }

    /**
     * 隐藏新增卡片弹窗
     * @returns {void}
     */
    function hideModal() {
        document.getElementById('modal-overlay').classList.add('hidden');
        currentColumn = null;
    }

    /**
     * 清空表单内容
     * @returns {void}
     */
    function clearForm() {
        document.getElementById('block-name').value = '';
        if (editorDesc) editorDesc.setContents([]);
        if (editorTeacher) editorTeacher.setContents([]);
    }

    /**
     * 提交表单，创建新卡片
     * 验证输入，创建卡片DOM，添加到页面
     * @returns {void}
     */
    function submitForm() {
        const nameInput = document.getElementById('block-name');
        const name = nameInput.value.trim();
        if (!name) {
            alert('请输入名称');
            nameInput.focus();
            return;
        }

        const desc = editorDesc.root.innerHTML;
        const teacher = editorTeacher.root.innerHTML;
        const colId = getColumnIdentifier(currentColumn);
        const newBlock = createBlock(colId, name, desc, teacher);

        // 显示教师参考按钮如果有内容
        if (hasMeaningfulHtml(teacher)) {
            const teachBtn = newBlock.querySelector('.w_teachbtn');
            if (teachBtn) {
                teachBtn.style.display = 'block';
                teachBtn.dataset.teacherContent = teacher;
            }
        }

        const addBtn = currentColumn.querySelector('.w_addbtn');
        addBtn.parentElement.insertBefore(newBlock, addBtn);

        // 更新全局集合
        blocks.push(newBlock);

        originalPos.set(newBlock, { x: 0, y: 0 });
        foldState.set(newBlock, false);

        const levelKey = newBlock.id[0].toLowerCase();
        if (levelKey !== 'e') {
            createSvgConnectorPoint(newBlock, 'start');
        }
        if (levelKey !== 'a') {
            createSvgConnectorPoint(newBlock, 'end');
        }
        updateSvgConnectorPositions();

        const toggleBtn = newBlock.querySelector('.toggle-collapse');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                toggleFold(newBlock);
            });
        }

        initBlockEvents(newBlock, desc, teacher);

        newBlock.addEventListener('mouseenter', () => {
            handleBlockHover(newBlock, true);
        });
        newBlock.addEventListener('mouseleave', () => {
            handleBlockHover(newBlock, false);
        });

        hideModal();
        clearForm();
        // 更新层级标题
        updateLevelTitles(); 
    }

    /**
     * 初始化添加按钮点击事件
     * @returns {void}
     */
    function initAddButtons() {
        document.querySelectorAll('.w_addbtn').forEach(btn => {
            if (btn.dataset.bound === '1') return;
            btn.dataset.bound = '1';
            btn.addEventListener('click', () => {
                showModal(btn.closest('.w_cont_problem'));
            });
        });
    }

    /**
     * 初始化模态框事件（新增卡片弹窗）
     * @returns {void}
     */
    function initModalEvents() {
        initEditors();
        document.getElementById('modal-close').addEventListener('click', () => { hideModal(); clearForm(); });
        document.getElementById('btn-cancel').addEventListener('click', () => { hideModal(); clearForm(); });
        document.getElementById('btn-confirm').addEventListener('click', (e) => { e.preventDefault(); submitForm(); });
        // 移除点击透明层隐藏弹窗的功能
        // document.getElementById('modal-overlay').addEventListener('click', (e) => {
        //     if (e.target.id === 'modal-overlay') { hideModal(); clearForm(); }
        // });
        document.getElementById('add-form').addEventListener('submit', (e) => { e.preventDefault(); submitForm(); });
    }

    // ========== 编辑层级功能 ==========
    let currentEditingColumn = null;

    // ==================== 层级编辑功能 ====================

    /**
     * 显示层级编辑弹窗
     * @param {HTMLElement} column - 要编辑的列容器
     * @returns {void}
     */
    function showLevelEditModal(column) {
        currentEditingColumn = column;
        const title = column.querySelector('.w_contp_txt');
        const tips = column.querySelector('.w_contp_tips');

        document.getElementById('level-name').value = title.textContent.replace(/（\d+）$/, '').trim();
        document.getElementById('level-desc').value = tips.textContent;
        document.getElementById('level-edit-modal-overlay').classList.remove('hidden');
        document.getElementById('level-name').focus();
    }

    /**
     * 隐藏层级编辑弹窗
     * @returns {void}
     */
    function hideLevelEditModal() {
        document.getElementById('level-edit-modal-overlay').classList.add('hidden');
    }

    /**
     * 保存层级编辑内容
     * @returns {void}
     */
    function saveLevelEdit() {
        if (!currentEditingColumn) return;

        const name = document.getElementById('level-name').value;
        const desc = document.getElementById('level-desc').value;

        if (!name) return;

        const title = currentEditingColumn.querySelector('.w_contp_txt');
        const tips = currentEditingColumn.querySelector('.w_contp_tips');

        // 更新层级名称
        const blockCount = title.textContent.match(/\（\d+\）/)[0];
        title.textContent = `${name}${blockCount}`;

        // 更新层级描述
        tips.textContent = desc;

        hideLevelEditModal();
    }

    /**
     * 初始化层级编辑弹窗事件
     * 为每一列的编辑按钮绑定点击事件，以及弹窗的关闭和保存事件
     * @returns {void}
     */
    function initLevelEditEvents() {
        // 为编辑图标添加点击事件
        document.querySelectorAll('.w_contp_edit').forEach(editBtn => {
            editBtn.addEventListener('click', () => {
                const column = editBtn.closest('.w_cont_problem');
                showLevelEditModal(column);
            });
        });

        // 关闭弹窗事件
        document.getElementById('level-edit-modal-close').addEventListener('click', hideLevelEditModal);
        document.getElementById('level-edit-btn-cancel').addEventListener('click', hideLevelEditModal);
        // 移除点击透明层隐藏弹窗的功能
        // document.getElementById('level-edit-modal-overlay').addEventListener('click', (e) => {
        //     if (e.target === document.getElementById('level-edit-modal-overlay')) {
        //         hideLevelEditModal();
        //     }
        // });

        // 保存编辑事件
        document.getElementById('level-edit-btn-confirm').addEventListener('click', (e) => {
            e.preventDefault();
            saveLevelEdit();
        });
    }

    // ========== 层级管理功能 ==========
    let levels = [];
    let currentEditingLevelIndex = null;

    // ==================== 层级管理功能 ====================

    /**
     * 初始化层级数据
     * 从页面中读取当前的层级信息
     *
     * @returns {void}
     */
    function initLevels() {
        const columns = document.querySelectorAll('.w_cont_problem');
        levels = Array.from(columns).map((col, index) => {
            const title = col.querySelector('.w_contp_txt');
            return {
                id: String.fromCharCode(97 + index),
                name: title.textContent.replace(/（\d+）$/, '').trim()
            };
        });
    }

    /**
     * 显示设置弹窗
     * 打开层级管理弹窗，显示层级列表
     *
     * @returns {void}
     */
    function showSettingsModal() {
        initLevels();
        renderLevelList();
        document.getElementById('settings-modal-overlay').classList.remove('hidden');
    }

    /**
     * 隐藏设置弹窗
     * @returns {void}
     */
    function hideSettingsModal() {
        document.getElementById('settings-modal-overlay').classList.add('hidden');
    }

    /**
     * 渲染层级列表
     * 在设置弹窗中显示层级列表，支持编辑和删除
     *
     * @returns {void}
     */
    function renderLevelList() {
        const listContainer = document.getElementById('level-list');
        listContainer.innerHTML = '';

        levels.forEach((level, index) => {
            const item = document.createElement('div');
            item.className = 'level-item';
            const deleteBtn = index === levels.length - 1 ?
                `<span class="level-delete-btn" data-index="${index}">删除</span>` : '';
            item.innerHTML = `
                        <span class="level-item-name">${index + 1}. ${level.name}</span>
                        <div class="level-item-actions">
                            <span class="level-edit-btn" data-index="${index}">编辑</span>
                            ${deleteBtn}
                        </div>
                    `;
            listContainer.appendChild(item);
        });

        document.querySelectorAll('.level-edit-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                showLevelFormModal('edit', index);
            });
        });

        document.querySelectorAll('.level-delete-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.target.dataset.index);
                deleteLevel(index);
            });
        });

        const addBtn = document.getElementById('add-level-btn');
        if (levels.length >= 5) {
            addBtn.disabled = true;
            addBtn.style.opacity = '0.5';
            addBtn.style.cursor = 'not-allowed';
            addBtn.textContent = '最多5个层级';
        } else {
            addBtn.disabled = false;
            addBtn.style.opacity = '1';
            addBtn.style.cursor = 'pointer';
            addBtn.textContent = '+ 添加层级';
        }
    }

    /**
     * 显示层级表单弹窗
     * 用于添加或编辑层级
     *
     * @param {string} mode - 'add' 或 'edit'
     * @param {number|null} index - 编辑模式时的层级索引
     * @returns {void}
     */
    function showLevelFormModal(mode, index = null) {
        currentEditingLevelIndex = index;
        const title = document.getElementById('level-form-title');
        const input = document.getElementById('level-form-name');

        if (mode === 'edit') {
            title.textContent = '编辑层级';
            input.value = levels[index].name;
        } else {
            title.textContent = '添加层级';
            input.value = '';
        }

        document.getElementById('level-form-modal-overlay').classList.remove('hidden');
        input.focus();
    }

    /**
     * 隐藏层级表单弹窗
     * @returns {void}
     */
    function hideLevelFormModal() {
        document.getElementById('level-form-modal-overlay').classList.add('hidden');
        currentEditingLevelIndex = null;
    }

    /**
     * 保存层级表单
     * @returns {void}
     */
    function saveLevelForm() {
        const name = document.getElementById('level-form-name').value;
        if (!name) return;

        if (currentEditingLevelIndex !== null) {
            levels[currentEditingLevelIndex].name = name;
            applyLevelsToPage();
        } else {
            const newId = String.fromCharCode(97 + levels.length);
            levels.push({
                id: newId,
                name: name
            });
            applyLevelsToPage();
        }

        hideLevelFormModal();
        renderLevelList();
    }

    /**
     * 删除层级  
     * @param {number} index - 要删除的层级索引
     * @returns {void}
     */
    function deleteLevel(index) {
        showDeleteLevelConfirmModal();
        document.getElementById('delete-level-confirm-btn').addEventListener('click', (e) => {
            e.preventDefault();
           
            levels.splice(index, 1);
            levels.forEach((level, i) => {
                level.id = String.fromCharCode(97 + i);
            });
            applyLevelsToPage();
            renderLevelList();
            hideDeleteLevelConfirmModal();
        });
        document.getElementById('delete-level-cancel-btn').addEventListener('click', (e) => {
            hideDeleteLevelConfirmModal();
        })
    }

    /**
     * 显示删除层级确认弹窗
     * @returns {void}
     */
    function showDeleteLevelConfirmModal(block) {
        currentDeletingBlock = block;
        document.getElementById('delete-level-confirm-modal-overlay').classList.remove('hidden');
    }

    /**
  * 隐藏删除层级确认弹窗
  * @returns {void}
  */
    function hideDeleteLevelConfirmModal() {
        document.getElementById('delete-level-confirm-modal-overlay').classList.add('hidden');
        currentDeletingBlock = null;
    }

    /**
     * 按当前 levels 数据同步页面层级列（新增/编辑/删除最后一层）
     * @returns {void}
     */
    function applyLevelsToPage() {
        const contentWrap = document.querySelector('.w_cont');
        if (!contentWrap) return;

        let columns = Array.from(contentWrap.querySelectorAll('.w_cont_problem'));
        const targetCount = levels.length;

        while (columns.length > targetCount) {
            const col = columns.pop();
            const colId = getColumnIdentifier(col);
            const colBlocks = blocks.filter(b => b.id.startsWith(colId));

            connections = connections.filter(conn => {
                const sb = getBlockFromPoint(conn.startElement);
                const eb = getBlockFromPoint(conn.endElement);
                const shouldRemove = colBlocks.includes(sb) || colBlocks.includes(eb);
                if (shouldRemove && conn.element && conn.element.parentNode) {
                    conn.element.remove();
                }
                return !shouldRemove;
            });

            colBlocks.forEach(b => {
                const idx = blocks.indexOf(b);
                if (idx > -1) blocks.splice(idx, 1);
                originalPos.delete(b);
                foldState.delete(b);
            });

            col.remove();
        }

        while (columns.length < targetCount) {
            const levelIdx = columns.length;
            const cfg = [
                { cls: 'ABox', icon: 'fa-question', color: '#409eff' },
                { cls: 'BBox', icon: 'fa-layer-group', color: '#67c23a' },
                { cls: 'CBox', icon: 'fa-puzzle-piece', color: '#e6a23c' },
                { cls: 'DBox', icon: 'fa-flag', color: '#f56c6c' },
                { cls: 'EBox', icon: 'fa-star', color: '#E372DB' }
            ][levelIdx];
            const letter = String.fromCharCode(97 + levelIdx);
            const col = document.createElement('div');
            col.className = `w_cont_problem ${cfg.cls}`;
            col.innerHTML = `
                <div class="w_contp_head">
                    <div class="w_contp_icon" style="background: ${cfg.color};">
                        <i class="fas ${cfg.icon}"></i>
                    </div>
                    <div class="w_contp_title_container">
                        <p class="w_contp_txt">${levels[levelIdx].name}（0）</p>
                        <i class="fas fa-edit w_contp_edit" style="cursor: pointer; margin-left: 10px; color: #909399;"></i>
                    </div>
                </div>
                <p class="w_contp_tips">${levels[levelIdx].name}描述</p>
                <div class="w_contp_main">
                    <div class="w_addbtn">+添加</div>
                </div>
            `;
            contentWrap.appendChild(col);
            columns.push(col);

            if (!blockIdCounter[letter]) blockIdCounter[letter] = 0;
        }

        columns = Array.from(contentWrap.querySelectorAll('.w_cont_problem'));
        columns.forEach((col, index) => {
            const titleEl = col.querySelector('.w_contp_txt');
            const tipsEl = col.querySelector('.w_contp_tips');
            const colId = String.fromCharCode(97 + index);
            const count = blocks.filter(b => b.id.startsWith(colId)).length;
            if (titleEl) titleEl.textContent = `${levels[index].name}（${count}）`;
            if (tipsEl && !tipsEl.textContent.trim()) tipsEl.textContent = `${levels[index].name}描述`;
        });

        document.querySelectorAll('.w_contp_edit').forEach(btn => {
            btn.replaceWith(btn.cloneNode(true));
        });
        initLevelEditEvents();
        initAddButtons();
        updateAllFolds();
        syncConnectorPoints();
        updateBadges();
        updateAllLines();
        updateLastLevelCardUi();
    }

    /**
     * 初始化设置事件
     * 为设置相关的按钮绑定事件处理函数
     *
     * @returns {void}
     */
    function initSettingsEvents() {
        // 设置按钮点击
        document.querySelector('.setbtn').addEventListener('click', showSettingsModal);

        // 关闭设置弹窗
        document.getElementById('settings-modal-close').addEventListener('click', hideSettingsModal);
        document.getElementById('settings-btn-cancel').addEventListener('click', hideSettingsModal);
        // 移除点击透明层隐藏弹窗的功能
        // document.getElementById('settings-modal-overlay').addEventListener('click', (e) => {
        //     if (e.target === document.getElementById('settings-modal-overlay')) {
        //         hideSettingsModal();
        //     }
        // });

        // 确定设置
        document.getElementById('settings-btn-confirm').addEventListener('click', (e) => {
            e.preventDefault();
            hideSettingsModal();
            expandAll();
            updateLastLevelCardUi();
        });

        // 添加层级按钮
        document.getElementById('add-level-btn').addEventListener('click', () => {
            if (levels.length < 5) {
                showLevelFormModal('add');
            }
        });


        // 关闭层级表单弹窗
        document.getElementById('level-form-modal-close').addEventListener('click', hideLevelFormModal);
        document.getElementById('level-form-btn-cancel').addEventListener('click', hideLevelFormModal);
        // 移除点击透明层隐藏弹窗的功能
        // document.getElementById('level-form-modal-overlay').addEventListener('click', (e) => {
        //     if (e.target === document.getElementById('level-form-modal-overlay')) {
        //         hideLevelFormModal();
        //     }
        // });

        // 保存层级表单
        document.getElementById('level-form-btn-confirm').addEventListener('click', (e) => {
            e.preventDefault();
            saveLevelForm();
        });

        // 表单提交
        document.getElementById('level-form').addEventListener('submit', (e) => {
            e.preventDefault();
            saveLevelForm();
        });
    }

    // ==================== 卡片操作功能 ====================
    /** @type {HTMLElement|null} 当前正在编辑的卡片元素 */
    let currentEditingBlock = null;
    /** @type {HTMLElement|null} 当前正在关联子级的卡片元素 */
    let currentConnectingBlock = null;
    /** @type {HTMLElement|null} 当前正在删除的卡片元素 */
    let currentDeletingBlock = null;

    // ==================== 编辑卡片功能 ====================

    /**
     * 显示编辑卡片弹窗
     * 打开编辑卡片的模态框，并初始化富文本编辑器
     *
     * @param {HTMLElement} block - 要编辑的卡片DOM元素
     * @returns {void}
     */
    function showEditBlockModal(block) {
        currentEditingBlock = block;
        const title = block.querySelector('.block-title').textContent;
        const content = block.querySelector('.block-content-text').innerHTML;
        const teacherContent = block.querySelector('.w_teachbtn')?.dataset.teacherContent || '';

        document.getElementById('edit-block-name').value = title;

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

        window.editBlockEditorDesc.root.innerHTML = content;
        window.editBlockEditorTeacher.root.innerHTML = teacherContent;

        document.getElementById('edit-block-modal-overlay').classList.remove('hidden');
        document.getElementById('edit-block-name').focus();

    }

    /**
     * 隐藏编辑卡片弹窗
     * @returns {void}
     */
    function hideEditBlockModal() {
        document.getElementById('edit-block-modal-overlay').classList.add('hidden');
        currentEditingBlock = null;
    }

    /**
     * 保存编辑的卡片内容
     * @returns {void}
     */
    function saveEditBlock() {
        if (!currentEditingBlock) return;

        const name = document.getElementById('edit-block-name').value;
        const desc = window.editBlockEditorDesc.root.innerHTML;
        const teacher = window.editBlockEditorTeacher.root.innerHTML;

        if (!name) return;

        // 更新卡片内容
        currentEditingBlock.querySelector('.block-title').textContent = name;
        currentEditingBlock.querySelector('.block-content-text').innerHTML = desc;

        const teachBtn = currentEditingBlock.querySelector('.w_teachbtn');
        if (teachBtn) {
            if (hasMeaningfulHtml(teacher)) {
                teachBtn.style.display = 'block';
                teachBtn.dataset.teacherContent = teacher;
            } else {
                teachBtn.style.display = 'none';
                delete teachBtn.dataset.teacherContent;
            }
        }

        updateAllFolds();
        updateAllLines();
        saveToLocalStorage();
        hideEditBlockModal();
    }

    // ==================== 关联子级功能 ====================

    /**
     * 显示关联子级弹窗
     * 列出当前卡片可连接的下一层级卡片，允许用户选择连接关系
     *
     * @param {HTMLElement} block - 当前卡片元素
     * @returns {void}
     */
    function showConnectChildrenModal(block) {
        currentConnectingBlock = block;
        const blockId = block.id;
        const level = blockId[0].toUpperCase();

        // 更新层级信息
        const levelInfo = document.querySelector('.level-info');
        const levelIcon = levelInfo.querySelector('.level-icon i');
        const levelName = levelInfo.querySelector('.level-name');
        const levelCount = levelInfo.querySelector('.level-count');

        // 设置层级图标和颜色
        const levelColors = { 'A': '#409eff', 'B': '#67c23a', 'C': '#e6a23c', 'D': '#f56c6c', 'E': '#E372DB' };
        const levelIcons = { 'A': 'fa-question', 'B': 'fa-layer-group', 'C': 'fa-puzzle-piece', 'D': 'fa-flag', 'E': 'fa-star' };

        levelIcon.className = `fas ${levelIcons[level]}`;
        levelIcon.parentElement.style.background = levelColors[level];
        levelName.textContent = `${level}层级`;

        // 获取当前层级的卡片数量
        const levelBlocks = blocks.filter(b => b.id.startsWith(level.toLowerCase()));
        levelCount.textContent = `${levelBlocks.length}个卡片`;

        // 生成子级列表
        const childrenList = document.querySelector('.children-list');
        childrenList.innerHTML = '';

        // 获取下一层级的卡片作为子级
        const nextLevel = String.fromCharCode(level.charCodeAt(0) + 1);
        const childBlocks = blocks.filter(b => b.id.startsWith(nextLevel.toLowerCase()));

        childBlocks.forEach(child => {
            const childItem = document.createElement('div');
            childItem.className = 'child-item';

            // 检查是否已经连接
            const isConnected = connections.some(conn => {
                const startBlock = getBlockFromPoint(conn.startElement);
                const endBlock = getBlockFromPoint(conn.endElement);
                return startBlock === currentConnectingBlock && endBlock === child;
            });

            if (isConnected) {
                childItem.classList.add('connected');
            }

            childItem.innerHTML = `
                        <input type="checkbox" class="child-checkbox" ${isConnected ? 'checked' : ''} data-child-id="${child.id}">
                        <span class="child-name">${child.querySelector('.block-title').textContent}</span>
                        <span class="child-status">${isConnected ? '已连接' : '未连接'}</span>
                    `;

            childrenList.appendChild(childItem);
        });

        document.getElementById('connect-children-modal-overlay').classList.remove('hidden');
    }

    /**
     * 隐藏关联子级弹窗
     * @returns {void}
     */
    function hideConnectChildrenModal() {
        document.getElementById('connect-children-modal-overlay').classList.add('hidden');
        currentConnectingBlock = null;
    }

    /**
     * 保存关联子级选择
     * 确认用户选择的子级卡片，更新连接关系
     * @returns {void}
     */
    function saveConnectChildren() {
        if (!currentConnectingBlock) return;

        const checkboxes = document.querySelectorAll('.child-checkbox');

        checkboxes.forEach(checkbox => {
            const childId = checkbox.dataset.childId;
            const childBlock = document.getElementById(childId);
            const isChecked = checkbox.checked;

            // 检查当前连接状态
            const existingConnection = connections.find(conn => {
                const startBlock = getBlockFromPoint(conn.startElement);
                const endBlock = getBlockFromPoint(conn.endElement);
                return startBlock === currentConnectingBlock && endBlock === childBlock;
            });

            if (isChecked && !existingConnection) {
                const startInfo = svgConnectorPoints.get(`${currentConnectingBlock.id}-start`);
                const endInfo = svgConnectorPoints.get(`${childBlock.id}-end`);

                if (startInfo && endInfo) {
                    const startBlock = startInfo.block;
                    const endBlock = endInfo.block;
                    const sg = startBlock.id[0].toUpperCase();
                    const eg = endBlock.id[0].toUpperCase();
                    const diff = Math.abs(sg.charCodeAt(0) - eg.charCodeAt(0));
                    const isForward = sg.charCodeAt(0) < eg.charCodeAt(0);

                    if (diff === 1 && isForward) {
                        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

                        const startLevel = (startBlock.className.match(/level-(\d+)/) || [])[1] || '1';
                        const endLevel = (endBlock.className.match(/level-(\d+)/) || [])[1] || '1';

                        let pathClass = 'path-line';
                        if (startLevel === '1' && endLevel === '2') {
                            pathClass += ' level-1-to-level-2';
                        } else if (startLevel === '2' && endLevel === '3') {
                            pathClass += ' level-2-to-level-3';
                        } else if (startLevel === '3' && endLevel === '4') {
                            pathClass += ' level-3-to-level-4';
                        } else if (startLevel === '4' && endLevel === '5') {
                            pathClass += ' level-4-to-level-5';
                        } else {
                            pathClass += ` level-${startLevel}-to-level-${endLevel}`;
                        }

                        path.setAttribute('class', pathClass);

                        const startCoord = getSvgPointCoord(startInfo.dataId);
                        const endCoord = getSvgPointCoord(endInfo.dataId);
                        path.setAttribute('d', bezier(startCoord.x, startCoord.y, endCoord.x, endCoord.y));
                        svg.insertBefore(path, connectorGroup);

                        connections.push({
                            id: connId++,
                            startElement: startInfo.element,
                            endElement: endInfo.element,
                            element: path
                        });

                        path.addEventListener('mouseenter', onPathMouseEnter);
                        path.addEventListener('mouseleave', onPathMouseLeave);
                        updateBadges();
                    }
                }
            } else if (!isChecked && existingConnection) {
                // 删除连接
                svg.removeChild(existingConnection.element);
                connections = connections.filter(c => c.id !== existingConnection.id);
                updateBadges();
            }
        });

        updateAllFolds();
        updateAllLines();
        hideConnectChildrenModal();
        saveToLocalStorage(); // 保存关联子级选择到localStorage
    }

    // 删除卡片功能
    // ==================== 删除卡片功能 ====================

    /**
     * 显示删除确认弹窗
     * @param {HTMLElement} block - 要删除的卡片元素
     * @returns {void}
     */
    function showDeleteConfirmModal(block) {
        currentDeletingBlock = block;
        document.getElementById('delete-confirm-modal-overlay').classList.remove('hidden');
    }

    /**
     * 隐藏删除确认弹窗
     * @returns {void}
     */
    function hideDeleteConfirmModal() {
        document.getElementById('delete-confirm-modal-overlay').classList.add('hidden');
        currentDeletingBlock = null;
    }

    /**
     * 执行卡片删除操作
     * 移除卡片DOM、清理相关连线、更新SVG连接点和全局状态
     * @returns {void}
     */
    function deleteBlock() {
        if (!currentDeletingBlock) return;

        // 删除与该卡片相关的所有连接
        const blockId = currentDeletingBlock.id;
        const connectionsToRemove = connections.filter(conn => {
            const startBlock = getBlockFromPoint(conn.startElement);
            const endBlock = getBlockFromPoint(conn.endElement);
            return startBlock === currentDeletingBlock || endBlock === currentDeletingBlock;
        });

        connectionsToRemove.forEach(conn => {
            svg.removeChild(conn.element);
        });

        connections = connections.filter(conn => {
            const startBlock = getBlockFromPoint(conn.startElement);
            const endBlock = getBlockFromPoint(conn.endElement);
            return startBlock !== currentDeletingBlock && endBlock !== currentDeletingBlock;
        });

        // 删除卡片
        currentDeletingBlock.remove();

        // 清理SVG连接点
        const startDataId = `${blockId}-start`;
        const endDataId = `${blockId}-end`;
        if (svgConnectorPoints.has(startDataId)) {
            svgConnectorPoints.get(startDataId).element.remove();
            svgConnectorPoints.delete(startDataId);
        }
        if (svgConnectorPoints.has(endDataId)) {
            svgConnectorPoints.get(endDataId).element.remove();
            svgConnectorPoints.delete(endDataId);
        }

        // 更新卡片数组
        const index = blocks.indexOf(currentDeletingBlock);
        if (index > -1) {
            blocks.splice(index, 1);
        }

        updateBadges();
        updateLevelTitles();
        updateAllFolds();
        updateAllLines();
        saveToLocalStorage();
        hideDeleteConfirmModal();
    }

    // 详情弹窗相关函数
    // ==================== 详情弹窗功能 ====================

    /**
     * 显示详情弹窗
     * @param {string} content - 要显示的内容
     * @returns {void}
     */
    function showDetailModal(content) {
        document.getElementById('detail-modal-content').textContent = content;
        document.getElementById('detail-modal-overlay').classList.remove('hidden');
    }

    /**
     * 隐藏详情弹窗
     * @returns {void}
     */
    function hideDetailModal() {
        document.getElementById('detail-modal-overlay').classList.add('hidden');
    }

    // ==================== 教师参考弹窗功能 ====================

    /**
     * 显示教师参考弹窗（支持HTML内容）
     * @param {string} content - 要显示的HTML内容
     * @returns {void}
     */
    function showTeacherModal(content) {
        document.getElementById('detail-modal-content').innerHTML = content;
        document.getElementById('detail-modal-overlay').classList.remove('hidden');
    }

    // ==================== 初始化新卡片事件 ====================

    /**
     * 初始化新卡片的事件监听
     * @param {HTMLElement} block - 卡片元素
     * @param {string} desc - 描述内容
     * @param {string} teacher - 教师参考内容
     * @returns {void}
     */
    function initBlockEvents(block, desc, teacher) {

        addCardDragHandle(block);

        // 详情按钮事件
        const detailBtn = block.querySelector('.w_contp_btn');
        if (detailBtn) {
            detailBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const liveDesc = block.querySelector('.block-content-text')?.innerHTML || '';
                showTeacherModal(liveDesc || '暂无内容');
            });
        }

        // 编辑按钮事件
        const editBtn = block.querySelector('.edit-btn');
        if (editBtn) {
            editBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showEditBlockModal(block);
            });
        }

        // 关联子级按钮事件
        const connectBtn = block.querySelector('.connect-btn');
        if (connectBtn) {
            connectBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showConnectChildrenModal(block);
            });
        }

        // 删除按钮事件
        const deleteBtn = block.querySelector('.delete-btn');
        if (deleteBtn) {
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                showDeleteConfirmModal(block);
            });
        }

        // 教师参考按钮事件 
        const teachBtn = block.querySelector('.w_teachbtn');
        if (teachBtn) {

            teachBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const liveTeacher = teachBtn.dataset.teacherContent || teacher || '';
                showTeacherModal(liveTeacher || '暂无教师参考');
            });
        }



        // 点击卡片事件（仅展开状态有效）
        block.addEventListener('click', (e) => {
            if (e.target.closest('.w_contp_btn, .action-btn, .w_teachbtn, .toggle-collapse, .w_block_btns, .svg-connector-point, .card-drag-handle')) {
                return;
            }

            if (block.classList.contains('folded-block')) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            if (shouldSuppressCardNavigation()) {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
                return;
            }

            const isExpanded = !foldState.get(block);

            if (isExpanded) {
                const cardId = block.id;
                navigateToQuestionMapDetail(cardId);
            }
        });
    }

    // 全局事件监听器（确保页面加载完成后绑定）
    document.addEventListener('DOMContentLoaded', function () {
        console.log('页面加载完成，添加全局事件监听器');

        // 为所有卡片添加点击事件
        document.addEventListener('click', function (e) {
            const block = e.target.closest('.draggable-block');
            if (!block) return;

            if (e.target.closest('.w_contp_btn, .action-btn, .w_teachbtn, .toggle-collapse, .w_block_btns, .svg-connector-point, .card-drag-handle')) {
                return;
            }

            if (block.classList.contains('folded-block')) {
                e.stopPropagation();
                return;
            }

            if (shouldSuppressCardNavigation()) {
                e.stopPropagation();
                return;
            }

            const isExpanded = !foldState.get(block);

            if (isExpanded) {
                const cardId = block.id;
                navigateToQuestionMapDetail(cardId);
            }
        });
    });

    /**
     * 导航至 questionMapDetail 详情页面
     * 构建当前卡片的关联链并跳转到详情页
     *
     * @param {string} cardId - 目标卡片ID
     * @returns {void}
     */
    function navigateToQuestionMapDetail(cardId) {
        const ls1 = StorageManager.get('ls1', {});
        const connections = ls1.connections || [];

        const relationChain = buildRelationChain(cardId, connections);

        StorageManager.set('relationChain', relationChain);

        // 跳转到questionMapDetail页面
        window.location.href = 'questionMapDetail.html';
    }

    /**
     * 构建从指定卡片到最下游的关系链
     * 使用BFS遍历所有下游连接，收集路径上的所有卡片ID
     *
     * @param {string} startId - 起始卡片ID
     * @param {Array} connections - 连接关系数组（含 startId, endId 属性）
     * @returns {string[]} 关系链上的所有卡片ID数组
     */
    function buildRelationChain(startId, connections) {
        const chain = new Set();
        const queue = [startId];

        // 添加起始卡片
        chain.add(startId);

        // BFS遍历所有下游卡片
        while (queue.length > 0) {
            const currentId = queue.shift();

            // 找到所有以当前卡片为起点的连接
            const outgoingConnections = connections.filter(conn => conn.startId === currentId);

            outgoingConnections.forEach(conn => {
                const endId = conn.endId;
                if (!chain.has(endId)) {
                    chain.add(endId);
                    queue.push(endId);
                }
            });
        }

        return Array.from(chain);
    }

    // ==================== 关联卡片查找 ====================

    /**
     * 查找所有在同一链条上的卡片（从当前卡片向上和向下延伸）
     * 只包含当前卡片所在的完整路径，不包含其他路径分支
     * 关键改进：当一个卡片有多个连接时，我们确保只沿着包含当前卡片的路径查找
     *
     * @param {HTMLElement} block - 起始卡片
     * @returns {Set<HTMLElement>} 同一链条上的所有卡片
     */
    function findAllRelatedBlocks(block) {
        const getLevelNum = (blk) => {
            const m = blk.className.match(/level-(\d+)/);
            return m ? parseInt(m[1], 10) : 1;
        };
        const maxLevel = Math.max(...blocks.map(getLevelNum));
        const currentLevel = getLevelNum(block);
        const relatedBlocks = new Set([block]);

        // 下游：只沿 start -> end 扩散，避免从下游节点反向串入其他父分支
        if (currentLevel < maxLevel) {
            const downVisited = new Set([block]);
            const downQueue = [block];
            while (downQueue.length) {
                const cur = downQueue.shift();
                connections.forEach(conn => {
                    const sb = getBlockFromPoint(conn.startElement);
                    const eb = getBlockFromPoint(conn.endElement);
                    if (sb === cur && eb && !downVisited.has(eb)) {
                        downVisited.add(eb);
                        relatedBlocks.add(eb);
                        downQueue.push(eb);
                    }
                });
            }
        }

        // 上游：只沿 end -> start 回溯
        if (currentLevel > 1) {
            const upVisited = new Set([block]);
            const upQueue = [block];
            while (upQueue.length) {
                const cur = upQueue.shift();
                connections.forEach(conn => {
                    const sb = getBlockFromPoint(conn.startElement);
                    const eb = getBlockFromPoint(conn.endElement);
                    if (eb === cur && sb && !upVisited.has(sb)) {
                        upVisited.add(sb);
                        relatedBlocks.add(sb);
                        upQueue.push(sb);
                    }
                });
            }
        }

        return relatedBlocks;
    }

    /**
     * 查找所有关联的连线
     * 找出连接在相关卡片之间的所有连线
     *
     * @param {Set<HTMLElement>} relatedBlocks - 关联卡片集合
     * @returns {Set<Object>} 关联连线集合
     */
    function findAllRelatedLines(relatedBlocks) {
        const relatedLines = new Set();

        connections.forEach(conn => {
            const startBlock = getBlockFromPoint(conn.startElement);
            const endBlock = getBlockFromPoint(conn.endElement);

            // 只有当两个端点都在 relatedBlocks 中时，这条连线才属于当前路径
            if (relatedBlocks.has(startBlock) && relatedBlocks.has(endBlock)) {
                relatedLines.add(conn);
            }
        });

        return relatedLines;
    }

    /**
     * 处理卡片悬停效果
     * 当鼠标悬停在卡片上时，高亮显示当前卡片所在的完整路径
     * 其他路径的卡片变灰，连线隐藏
     *
     * @param {HTMLElement} hoveredBlock - 悬停的卡片
     * @param {boolean} isHovering - 是否正在悬停
     * @returns {void}
     */
    // function handleBlockHover(hoveredBlock, isHovering) {
    //     // 检查是否处于收起状态
    //     const isCollapsedState = blocks.some(b => b.id.startsWith('a') && foldState.get(b));

    //     if (isHovering) {
    //         const relatedBlocks = findAllRelatedBlocks(hoveredBlock);

    //         hoveredBlock.classList.add('selected');

    //         // 仅在非收起状态下执行连线加粗效果
    //         if (!isCollapsedState) {
    //             const relatedLines = findAllRelatedLines(relatedBlocks);
    //             // 关联连线变粗，并且确保可见
    //             relatedLines.forEach(conn => {
    //                 conn.element.classList.add('thick');
    //                 conn.element.setAttribute('visibility', 'visible');
    //                 conn.element.style.visibility = 'visible';
    //             });
    //         }
    //     } else {
    //         // 恢复所有卡片
    //         document.querySelectorAll('.w_contp_item').forEach(block => {
    //             block.classList.remove('dimmed');
    //             block.classList.remove('selected');
    //         });

    //         // 恢复所有连线
    //         connections.forEach(conn => {
    //             conn.element.classList.remove('thick');
    //         });
    //         // 重新计算连线可见性
    //         updateAllLines();
    //     }
    // }


    /**
     * 设置卡片关联的SVG连接点变灰/恢复
     * 当卡片处于dimmed状态时，其start和end连接点同步降低透明度
     *
     * @param {HTMLElement} block - 卡片元素
     * @param {boolean} isDimmed - 是否变灰
     * @returns {void}
     */
    function setConnectorPointDimmed(block, isDimmed) {
        if (!block || !block.id) return;
        const startInfo = svgConnectorPoints.get(`${block.id}-start`);
        const endInfo = svgConnectorPoints.get(`${block.id}-end`);
        if (startInfo && startInfo.element) {
            startInfo.element.style.opacity = isDimmed ? '0.4' : '';
            startInfo.element.style.transition = 'opacity 0.3s ease';
        }
        if (endInfo && endInfo.element) {
            endInfo.element.style.opacity = isDimmed ? '0.4' : '';
            endInfo.element.style.transition = 'opacity 0.3s ease';
        }
    }

    /**
      * 卡片悬停处理函数
      */
    function handleBlockHover(block, isHover) {
        if (isDraggingConn) return;
        if (isDraggingCard) return;
        if (block.classList.contains('folded-block')) return;

        if (!isHover) {
            resetHoverState();
            return;
        }

        // 收起的A卡片悬停时，不做任何效果
        if (block.id.startsWith('a') && foldState.get(block)) {
            return;
        }

        const hasCollapsedABlock = blocks.some(b => b.id.startsWith('a') && foldState.get(b));

        if (hasCollapsedABlock) {
            handleCollapsedStateHover(block);
        } else {
            handleExpandedStateHover(block);
        }
    }

    /**
     * 展开状态下的节点悬停
     * 悬停节点的所有关联连线加粗，同层其他节点变灰
     */
    function handleExpandedStateHover(block) {
        const blockLevel = block.id[0];
        const relatedBlocks = findAllRelatedBlocks(block);
        const sameLevelBlocks = blocks.filter(b => b.id[0] === blockLevel && b !== block);

        block.classList.add('selected');

        sameLevelBlocks.forEach(b => {
            b.classList.add('dimmed');
            setConnectorPointDimmed(b, true);
        });

        blocks.forEach(b => {
            if (!relatedBlocks.has(b) && b.id[0] !== blockLevel) {
                b.classList.add('dimmed');
                setConnectorPointDimmed(b, true);
            }
        });

        connections.forEach(conn => {
            const sb = getBlockFromPoint(conn.startElement);
            const eb = getBlockFromPoint(conn.endElement);

            const isIncomingToHovered = eb === block;
            const isOutgoingFromHovered = sb === block;
            const isInRelatedPath = relatedBlocks.has(sb) && relatedBlocks.has(eb);

            if (isIncomingToHovered || isOutgoingFromHovered || isInRelatedPath) {
                conn.element.classList.add('thick');
                conn.element.classList.remove('hidden');
                conn.element.setAttribute('visibility', 'visible');
                conn.element.style.visibility = 'visible';
            } else {
                conn.element.classList.remove('thick');
                conn.element.classList.add('hidden');
            }
        });
    }

   
    /**
     * 收起状态下的节点悬停
     * - 收起的A卡片及其下游堆叠卡组变灰
     * - 悬停节点的上下游连线加粗
     * - 其他卡片变灰
     */
    function handleCollapsedStateHover(block) {
        const relatedBlocks = findAllRelatedBlocks(block); 


        // 收起的A卡片及其下游
        const collapsedABlocks = blocks.filter(b => b.id.startsWith('a') && foldState.get(b));
        const collapsedDownstreamSet = new Set();
        collapsedABlocks.forEach(aBlk => {
            collapsedDownstreamSet.add(aBlk);
            getDownstream(aBlk).forEach(b => collapsedDownstreamSet.add(b));
        });

        // 判断卡片是否属于堆叠卡组（被收起的A卡片的下游且被隐藏）
        function isInStackedGroup(b) {
            return collapsedDownstreamSet.has(b) && b.classList.contains('original-hidden');
        }
        block.classList.add('selected');

        // 非堆叠卡组变灰：非本身，非关联的卡片，非堆叠卡片，非收起的卡片
        blocks.forEach(b => {
            if (b === block) return;
            if (relatedBlocks.has(b) && !isInStackedGroup(b) && !collapsedABlocks.includes(b)) return;
            b.classList.add('dimmed');
            setConnectorPointDimmed(b, true);
        });

        // 堆叠卡组变灰
        document.querySelectorAll('.fold-group').forEach(folded => { 
            folded.classList.add('dimmed');
        });


        // 连线处理：相关路径加粗，其他隐藏
        connections.forEach(conn => {
            const sb = getBlockFromPoint(conn.startElement);
            const eb = getBlockFromPoint(conn.endElement);

            const sbInStacked = isInStackedGroup(sb);
            const ebInStacked = isInStackedGroup(eb);
            const sbIsCollapsedA = collapsedABlocks.includes(sb);
            const ebIsCollapsedA = collapsedABlocks.includes(eb);

            const isInRelatedPath = relatedBlocks.has(sb) && relatedBlocks.has(eb)
                && !sbInStacked && !ebInStacked && !sbIsCollapsedA && !ebIsCollapsedA;

            if (isInRelatedPath) {
                conn.element.classList.add('thick');
                conn.element.classList.remove('hidden');
                conn.element.setAttribute('visibility', 'visible');
                conn.element.style.visibility = 'visible';
            } else {
                conn.element.classList.remove('thick');
                conn.element.classList.add('hidden');
            }
        });

        // 折叠组连线隐藏
        foldGroupLines.forEach(line => {
            line.classList.add('hidden');
            line.style.visibility = 'hidden';
        });
    }

    /**
     * 重置悬停状态
     */
    function resetHoverState() {
        document.querySelectorAll('.w_contp_item').forEach(b => {
            b.classList.remove('dimmed');
            b.classList.remove('selected');
            setConnectorPointDimmed(b, false);
        });
        document.querySelectorAll('.folded-block').forEach(folded => {
            folded.closest('.fold-group').classList.remove('dimmed');
        });

        connections.forEach(conn => {
            conn.element.classList.remove('thick');
            conn.element.classList.remove('highlight');
            conn.element.classList.remove('hidden');
        });

        foldGroupLines.forEach(line => {
            line.classList.remove('hidden');
            line.style.visibility = 'visible';
        });

        updateAllLines();
    }



    // 初始化卡片操作事件
    // ==================== 初始化卡片操作事件 ====================

    /**
     * 初始化所有卡片的操作事件
     * 为所有卡片的按钮绑定事件处理函数
     *
     * @returns {void}
     */
    function initBlockActions() {
        // 使用事件委托统一处理所有卡片按钮点击，避免重复绑定问题
        document.addEventListener('click', (e) => {
            const block = e.target.closest('.draggable-block');
            if (!block) return;

            // 详情按钮
            if (e.target.closest('.w_contp_btn')) {
                e.stopPropagation();
                const content = block.querySelector('.block-content-text').textContent;
                showDetailModal(content);
                return;
            }

            // 编辑按钮
            if (e.target.closest('.edit-btn')) {
                e.stopPropagation();
                showEditBlockModal(block);
                return;
            }

            // 关联子级按钮
            if (e.target.closest('.connect-btn')) {
                e.stopPropagation();
                showConnectChildrenModal(block);
                return;
            }

            // 删除按钮
            if (e.target.closest('.delete-btn')) {
                e.stopPropagation();
                showDeleteConfirmModal(block);
                return;
            }

            // 教师参考按钮
            if (e.target.closest('.w_teachbtn')) {
                e.stopPropagation();
                const btn = e.target.closest('.w_teachbtn');
                const liveTeacher = btn.dataset.teacherContent || '';
                showTeacherModal(liveTeacher || '暂无教师参考');
                return;
            }
        });

        // 卡片悬停效果
        document.querySelectorAll('.w_contp_item').forEach(block => {
            block.addEventListener('mouseenter', () => {
                handleBlockHover(block, true);
            });
            block.addEventListener('mouseleave', () => {
                handleBlockHover(block, false);
            });
        });

        // 编辑卡片弹窗事件
        document.getElementById('edit-block-modal-close').addEventListener('click', hideEditBlockModal);
        document.getElementById('edit-block-btn-cancel').addEventListener('click', hideEditBlockModal);
        // 移除点击透明层隐藏弹窗的功能
        // document.getElementById('edit-block-modal-overlay').addEventListener('click', (e) => {
        //     if (e.target === document.getElementById('edit-block-modal-overlay')) {
        //         hideEditBlockModal();
        //     }
        // });
        document.getElementById('edit-block-btn-confirm').addEventListener('click', (e) => {
            e.preventDefault();
            saveEditBlock();
        });
        document.getElementById('edit-block-form').addEventListener('submit', (e) => {
            e.preventDefault();
            saveEditBlock();
        });

        // 关联子级弹窗事件
        document.getElementById('connect-children-modal-close').addEventListener('click', hideConnectChildrenModal);
        document.getElementById('connect-children-btn-cancel').addEventListener('click', hideConnectChildrenModal);
        // 移除点击透明层隐藏弹窗的功能
        // document.getElementById('connect-children-modal-overlay').addEventListener('click', (e) => {
        //     if (e.target === document.getElementById('connect-children-modal-overlay')) {

        //         hideConnectChildrenModal();
        //     }
        // });
        document.getElementById('connect-children-btn-confirm').addEventListener('click', (e) => {
            e.preventDefault();
            saveConnectChildren();
        });

        // 详情弹窗事件
        document.getElementById('detail-modal-close').addEventListener('click', hideDetailModal);
        // 移除点击透明层隐藏弹窗的功能
        // document.getElementById('detail-modal-overlay').addEventListener('click', (e) => {
        //     if (e.target === document.getElementById('detail-modal-overlay')) {
        //         hideDetailModal();
        //     }
        // });

        // 删除确认弹窗事件
        document.getElementById('delete-confirm-modal-close').addEventListener('click', hideDeleteConfirmModal);
        document.getElementById('delete-confirm-btn-cancel').addEventListener('click', hideDeleteConfirmModal);

        // 移除点击透明层隐藏弹窗的功能
        // document.getElementById('delete-confirm-modal-overlay').addEventListener('click', (e) => {
        //     if (e.target === document.getElementById('delete-confirm-modal-overlay')) {
        //         hideDeleteConfirmModal();
        //     }
        // });
        document.getElementById('delete-confirm-btn-confirm').addEventListener('click', (e) => {
            e.preventDefault();
            deleteBlock();
        });

        // 折叠区首卡支持直接操作（编辑/关联/删除），不刷新页面即可生效
        document.addEventListener('click', (e) => {
            const foldedBlock = e.target.closest('.folded-block');
            if (!foldedBlock) return;
            const sourceId = foldedBlock.dataset.sourceId;
            if (!sourceId) return;
            const sourceBlock = document.getElementById(sourceId);
            if (!sourceBlock) return;

            const actionBtn = e.target.closest('.action-btn');
            if (!actionBtn) return;
            e.stopPropagation();

            if (actionBtn.classList.contains('edit-btn')) {
                showEditBlockModal(sourceBlock);
            } else if (actionBtn.classList.contains('connect-btn')) {
                showConnectChildrenModal(sourceBlock);
            } else if (actionBtn.classList.contains('delete-btn')) {
                showDeleteConfirmModal(sourceBlock);
            }
        });
    }

    // ==================== 探索模式功能 ====================

    // 探索模式状态
    let exploreModeEnabled = false;
    let exploreOptions = {
        link: true,
        topic: true,
        answer: false
    };

    /**
     * 初始化探索模式相关事件
     */
    function initExploreMode() {
        const exploreBtn = document.getElementById('explore-mode-btn');
        const exploraIcon = document.getElementById('explora-icon');
        const setPopup = document.getElementById('explora-set-popup');
        const helpPopup = document.getElementById('explora-help-popup');
        const switchInput = document.getElementById('s_courseCenter');
        const exploraFlow = document.getElementById('w_exploraflow');
        const confirmBtn = document.getElementById('explora-set-confirm');
        const knowBtn = document.getElementById('explora-know-btn');
        const simulateBtn = document.getElementById('explora-simulate-btn');

        // 探索模式按钮悬停
        exploreBtn.addEventListener('mouseenter', () => {
            setPopup.classList.add('show');
            helpPopup.classList.remove('show');
        });

        exploreBtn.addEventListener('mouseleave', () => {
            setTimeout(() => {
                if (!setPopup.matches(':hover')) {
                    setPopup.classList.remove('show');
                }
            }, 200);
        });

        setPopup.addEventListener('mouseenter', () => {
            setPopup.classList.add('show');
        });

        setPopup.addEventListener('mouseleave', () => {
            setPopup.classList.remove('show');
        });

        // 问号图标悬停
        exploraIcon.addEventListener('mouseenter', () => {
            helpPopup.classList.add('show');
            setPopup.classList.remove('show');
        });

        exploraIcon.addEventListener('mouseleave', () => {
            setTimeout(() => {
                if (!helpPopup.matches(':hover')) {
                    helpPopup.classList.remove('show');
                }
            }, 200);
        });

        helpPopup.addEventListener('mouseenter', () => {
            helpPopup.classList.add('show');
        });

        helpPopup.addEventListener('mouseleave', () => {
            helpPopup.classList.remove('show');
        });

        // 开关切换
        switchInput.addEventListener('change', () => {
            if (switchInput.checked) {
                exploraFlow.classList.add('show');
            } else {
                exploraFlow.classList.remove('show');
            }
        });

        // 复选框事件
        document.getElementById('exploralink').addEventListener('change', (e) => {
            exploreOptions.link = e.target.checked;
        });

        document.getElementById('exploratopic').addEventListener('change', (e) => {
            exploreOptions.topic = e.target.checked;
        });

        document.getElementById('exploraanswer').addEventListener('change', (e) => {
            exploreOptions.answer = e.target.checked;
        });

        // 确定按钮
        confirmBtn.addEventListener('click', () => {
            exploreModeEnabled = switchInput.checked;
            setPopup.classList.remove('show');
        });

        // 我知道了按钮
        knowBtn.addEventListener('click', () => {
            helpPopup.classList.remove('show');
        });

        // 模拟体验按钮
        simulateBtn.addEventListener('click', () => {
            // 收集完整的层级数据（包括所有层级和连线信息）
            const fullData = collectFullHierarchyData();
            StorageManager.set('fullHierarchyData', fullData);

            StorageManager.set('exploreBlocks', fullData.level1 || []);

            // 跳转到 exploreList.html
            // window.location.href = 'exploreList.html';
            // 在新标签页中打开 exploreList.html
            window.open('exploreList.html', '_blank');
        });

        /**
         * 收集完整的层级数据
         */
        function collectFullHierarchyData() {
            // 动态获取所有层级容器
            const levelContainers = document.querySelectorAll('[class*="Box"]');
            const data = {
                connections: []
            };

            // 遍历所有可能的层级容器
            levelContainers.forEach(container => {
                // 从类名中提取层级数字（如 ABox -> 1, BBox -> 2, ...）
                const className = container.className;
                const levelMatch = className.match(/([A-Z])Box/);

                if (levelMatch) {
                    const letter = levelMatch[1];
                    // 将字母转换为层级数字：A=1, B=2, C=3, ...
                    const level = letter.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
                    const levelKey = `level${level}`;

                    // 初始化该层级数组
                    if (!data[levelKey]) {
                        data[levelKey] = [];
                    }

                    // 收集该层级的卡片
                    container.querySelectorAll('.w_contp_item').forEach(block => {
                        const blockData = extractBlockData(block, level);
                        if (blockData) {
                            data[levelKey].push(blockData);
                        }
                    });
                }
            });

            // 收集连线信息
            data.connections = connections.map(conn => ({
                id: conn.id,
                startId: conn.startElement.getAttribute('data-id')?.replace('-start', '') || '',
                endId: conn.endElement.getAttribute('data-id')?.replace('-end', '') || ''
            }));

            return data;
        }

        /**
         * 提取单个卡片数据
         */
        function extractBlockData(block, level) {
            if (!block) return null;

            // 尝试获取标题 - 先找 .w_contp_tle，找不到再找 .block-title
            let title = '';
            const tleEl = block.querySelector('.w_contp_tle');
            const titleEl = block.querySelector('.block-title');
            if (tleEl) {
                title = tleEl.textContent.trim();
            } else if (titleEl) {
                title = titleEl.textContent.trim();
            } else {
                // 如果都没有，使用 id 作为标题
                title = block.id.toUpperCase();
            }

            // 获取描述
            const descEl = block.querySelector('.block-content-text');
            const desc = descEl ? descEl.textContent.trim() : '';

            return {
                id: block.id,
                level: level,
                title: title,
                desc: desc
            };
        }
    }


    /**
     * 查找指定卡片的所有关联连线
     * 遍历所有连线，返回连接在相关卡片之间的所有连线
     *
     * @param {HTMLElement} block - 目标卡片元素
     * @returns {Set<Object>} 关联连线集合
     */
    function findAllRelatedLinesByBlock(block) {
        const relatedLines = new Set();
        const relatedBlocks = findAllRelatedBlocks(block);

        connections.forEach(conn => {
            const startBlock = getBlockFromPoint(conn.startElement);
            const endBlock = getBlockFromPoint(conn.endElement);

            if (relatedBlocks.has(startBlock) && relatedBlocks.has(endBlock)) {
                relatedLines.add(conn);
            }
        });

        return relatedLines;
    }

    // ========== 启动所有功能 ==========
    normalizeActionButtonIcons();
    init();
    initAddButtons();
    initModalEvents();
    initLevelEditEvents();
    initSettingsEvents();
    initBlockActions();
    initExploreMode();
    updateLastLevelCardUi();

    blocks.forEach(addCardDragHandle);

    // 响应式：堆叠卡片宽度同步（监听变化）
    // ==================== 响应式布局处理 ====================

    /**
     * 同步堆叠卡片的宽度
     * 确保堆叠的卡片宽度一致，适应响应式布局
     *
     * @returns {void}
     */
    function syncStackedWidths() {
        document.querySelectorAll('.stack-container').forEach(container => {
            const items = container.querySelectorAll('.stack-item .w_contp_item');
            if (items.length > 0) {
                items.forEach(item => item.style.width = '100%');
            }
        });
    }
    syncStackedWidths();
    window.addEventListener('resize', syncStackedWidths);
    new MutationObserver(syncStackedWidths).observe(document.body, { childList: true, subtree: true });

    // ==================== localStorage 保存功能 ====================
    /**
     * 保存连线数据到 localStorage.ls1，生成卡片层级数据到 ls2
     */
    function saveToLocalStorage() {
        try {
            const connectionsData = connections.map(conn => {
                const startBlock = getBlockFromPoint(conn.startElement);
                const endBlock = getBlockFromPoint(conn.endElement);
                return {
                    startId: startBlock ? startBlock.id : null,
                    endId: endBlock ? endBlock.id : null
                };
            }).filter(c => c.startId && c.endId);

            const relationChains = buildRelationChains(connectionsData);

            const ls1Data = {
                connections: connectionsData,
                relationChains: relationChains,
                timestamp: new Date().toISOString()
            };
            StorageManager.set('ls1', ls1Data);

            const ls2Data = generateLevelData();
            StorageManager.set('ls2', ls2Data);

            StorageManager.set('fullHierarchyData', ls2Data);

        } catch (e) {
            console.error('保存到 localStorage 失败:', e);
        }
    }

    /**
     * 构建所有第一层级卡片的连接关系链
     * 从connections数据中提取所有以a开头的卡片起始链
     *
     * @param {Array} connections - 连接数据数组，每项包含startId和endId
     * @returns {Array<string[]>} 关系链数组，每个元素是一个从第一层级开始的完整卡片ID链
     */
    function buildRelationChains(connections) {
        const connectionMap = {};
        connections.forEach(conn => {
            if (!connectionMap[conn.startId]) {
                connectionMap[conn.startId] = [];
            }
            if (!connectionMap[conn.startId].includes(conn.endId)) {
                connectionMap[conn.startId].push(conn.endId);
            }
        });

        // 找到所有第一层级的卡片（id以a开头）
        const level1Cards = Array.from(new Set(
            connections
                .filter(conn => conn.startId && conn.startId[0].toLowerCase() === 'a')
                .map(conn => conn.startId)
        ));
        const chains = [];

        const walk = (currentId, chain, visited) => {
            const nextIds = connectionMap[currentId] || [];
            if (nextIds.length === 0) {
                if (chain.length > 1) chains.push(chain);
                return;
            }

            nextIds.forEach(nextId => {
                if (visited.has(nextId)) return;
                walk(nextId, [...chain, nextId], new Set([...visited, nextId]));
            });
        };

        level1Cards.forEach(startId => {
            if (connectionMap[startId] && connectionMap[startId].length > 0) {
                walk(startId, [startId], new Set([startId]));
            }
        });

        return chains;
    }

    /**
     * 从页面DOM提取所有层级的卡片数据
     * 遍历所有卡片元素，按层级分组生成结构化数据
     *
     * @returns {Object} 层级数据对象，包含level1~level5的卡片数组和connections连接信息
     */
    function generateLevelData() {
        const levelData = {
            level1: [],
            level2: [],
            level3: [],
            level4: [],
            level5: [],
            connections: [] // 保留原始连接关系供 exploreList 使用
        };

        // 提取所有卡片
        document.querySelectorAll('.draggable-block').forEach(block => {
            const id = block.id;
            const levelMatch = block.className.match(/level-(\d+)/);
            const level = levelMatch ? parseInt(levelMatch[1]) : 1;

            const titleEl = block.querySelector('.block-title');
            const descEl = block.querySelector('.block-content-text');

            const cardData = {
                id: id,
                title: titleEl ? titleEl.textContent.trim() : '未命名',
                desc: descEl ? descEl.textContent.trim() : ''
            };

            if (level === 1) levelData.level1.push(cardData);
            else if (level === 2) levelData.level2.push(cardData);
            else if (level === 3) levelData.level3.push(cardData);
            else if (level === 4) levelData.level4.push(cardData);
            else if (level === 5) levelData.level5.push(cardData);
        });

        // 保存连接关系供 exploreList 使用
        levelData.connections = connections.map(conn => {
            const startBlock = getBlockFromPoint(conn.startElement);
            const endBlock = getBlockFromPoint(conn.endElement);
            return {
                startId: startBlock ? startBlock.id : null,
                endId: endBlock ? endBlock.id : null
            };
        }).filter(c => c.startId && c.endId);

        return levelData;
    }

    // ==================== localStorage 读取恢复功能 ====================
    /**
     * 从 localStorage 读取并恢复连线关系
     * 读取StorageManager中保存的连线数据，重建SVG连线
     * 无数据时自动初始化保存，有连线时清除现有连线后重建
     *
     * @returns {void}
     */
    function loadFromLocalStorage() {
        try {
            const data = StorageManager.get('ls1', null);
            if (!data) {
                saveToLocalStorage();
                return;
            }

            if (!data.connections || data.connections.length === 0) {
                return;
            }

            // 清除现有连接
            connections.forEach(conn => {
                if (conn.element && conn.element.parentNode) {
                    conn.element.remove();
                }
            });
            connections.splice(0, connections.length);

            // 恢复连接
            data.connections.forEach(conn => {
                const startDataId = `${conn.startId}-start`;
                const endDataId = `${conn.endId}-end`;
                const startInfo = svgConnectorPoints.get(startDataId);
                const endInfo = svgConnectorPoints.get(endDataId);

                if (startInfo && endInfo) {
                    const startBlock = startInfo.block;
                    const endBlock = endInfo.block;
                    const startLevel = startBlock ? (startBlock.className.match(/level-(\d+)/) || [])[1] || '1' : '1';
                    const endLevel = endBlock ? (endBlock.className.match(/level-(\d+)/) || [])[1] || '1' : '1';

                    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');

                    let pathClass = 'path-line';
                    if (startLevel === '1' && endLevel === '2') {
                        pathClass += ' level-1-to-level-2';
                    } else if (startLevel === '2' && endLevel === '3') {
                        pathClass += ' level-2-to-level-3';
                    } else if (startLevel === '3' && endLevel === '4') {
                        pathClass += ' level-3-to-level-4';
                    } else if (startLevel === '4' && endLevel === '5') {
                        pathClass += ' level-4-to-level-5';
                    } else {
                        pathClass += ` level-${startLevel}-to-level-${endLevel}`;
                    }
                    path.setAttribute('class', pathClass);

                    const sCoord = getSvgPointCoord(startDataId);
                    const eCoord = getSvgPointCoord(endDataId);

                    path.setAttribute('d', bezier(sCoord.x, sCoord.y, eCoord.x, eCoord.y));

                    svg.insertBefore(path, connectorGroup);

                    connections.push({
                        id: connId++,
                        startElement: startInfo.element,
                        endElement: endInfo.element,
                        element: path
                    });

                    path.addEventListener('mouseenter', onPathMouseEnter);
                    path.addEventListener('mouseleave', onPathMouseLeave);
                }
            });

            updateBadges(connections);
            updateAllLines();

            // 初始化默认折叠状态：有连线的卡片默认全部收起 
            foldsAllCard(); 
        } catch (e) {
            console.error('从localStorage恢复连接失败:', e);
        }
    }

    // 先尝试加载数据
    loadFromLocalStorage();
    // 确保数据被保存
    saveToLocalStorage();
})(); 
