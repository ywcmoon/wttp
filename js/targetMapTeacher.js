/**
 * targetMapTeacher.js - 能力图谱教师视图核心脚本
 *
 * 功能概述：
 *   1. 能力卡片列表渲染（支持拖拽排序、删除、开放班级）
 *   2. ECharts 柱状图展示各能力关联的知识点数量
 *   3. SVG 知识点关系图谱（力导向布局、节点拖拽、缩放平移）
 *   4. 班级筛选器（按班级过滤能力卡片）
 *   5. 知识点关联编辑（弹窗选择知识点树）
 *
 * 模块结构：
 *   一、常量与状态：存储键、核心状态、SVG状态、DOM引用
 *   二、数据加载与持久化
 *   三、数据筛选
 *   四、班级筛选器
 *   五、ECharts图表
 *   六、能力卡片渲染
 *   七、卡片拖拽排序
 *   八、SVG知识点图谱渲染
 *   九、SVG画布平移与缩放
 *   十、开放班级弹窗
 *   十一、知识点关联编辑弹窗
 *   十二、确认弹窗
 *   十三、事件绑定与初始化
 *
 * 数据存储键：
 *   - abilityMapData：能力条目数据
 *   - abilityMapClasses：班级列表
 *   - knowledgeTreeData：知识点树形数据
 *
 * 依赖：
 *   - common.js（StorageManager）
 *   - ECharts（图表库）
 *   - Font Awesome（图标）
 */
(function () {
    'use strict';

    /* ============================================================
     * 一、常量与状态
     * ============================================================ */

    // --- 1.1 存储键常量 ---

    /** @type {string} 能力数据在 localStorage 中的键名 */
    var STORAGE_KEY = 'abilityMapData';

    /** @type {string} 班级列表在 localStorage 中的键名 */
    var CLASS_KEY = 'abilityMapClasses';

    /** @type {string} 知识点树数据在 localStorage 中的键名 */
    var KNOWLEDGE_KEY = 'knowledgeTreeData';

    // --- 1.2 核心数据状态 ---

    /** @type {Array} 能力条目列表 */
    var abilities = [];

    /** @type {Array<string>} 标签列表 */
    var tags = [];

    /** @type {string|null} 当前选中的能力 ID */
    var selectedAbilityId = null;

    /** @type {string} 当前筛选的班级（'all' 表示全部） */
    var currentClass = 'all';

    /** @type {Object|null} ECharts 图表实例 */
    var chartInstance = null;

    /** @type {HTMLElement|null} 正在拖拽排序的能力卡片元素 */
    var dragItem = null;

    /** @type {number} 拖拽排序起始 Y 坐标 */
    var dragStartY = 0;

    /** @type {Object|null} 能力编辑公共模块实例 */
    var abilityEditor = null;

    // --- 1.3 SVG 图谱状态 ---

    /** @type {number} SVG 画布缩放比例（1 = 100%） */
    var svgScale = 1;

    /** @type {number} SVG 画布 X 轴平移偏移 */
    var svgPanX = 0;

    /** @type {number} SVG 画布 Y 轴平移偏移 */
    var svgPanY = 0;

    /** @type {boolean} 是否正在平移画布 */
    var isPanning = false;

    /** @type {number} 平移起始 X 坐标 */
    var panStartX = 0;

    /** @type {number} 平移起始 Y 坐标 */
    var panStartY = 0;

    /** @type {boolean} 是否正在拖拽图谱节点 */
    var isDraggingNode = false;

    /** @type {string|null} 当前拖拽的节点 ID */
    var dragNodeId = null;

    /** @type {number} 节点拖拽起始 X 坐标 */
    var dragNodeStartX = 0;

    /** @type {number} 节点拖拽起始 Y 坐标 */
    var dragNodeStartY = 0;

    /** @type {number|null} 长按计时器 ID */
    var longPressTimer = null;

    /** @type {boolean} 是否触发了长按 */
    var isLongPress = false;

    /** @type {Array} 图谱节点数据 */
    var graphNodes = [];

    /** @type {Array} 图谱连线数据 */
    var graphLinks = [];

    /** @type {Set<string>} 已折叠的父节点 ID 集合 */
    var collapsedNodes = new Set();

    // --- 1.4 DOM 元素引用 ---

    var classSelector = document.getElementById('class-selector');
    var selectorDisplay = document.getElementById('selector-display');
    var selectorDropdown = document.getElementById('selector-dropdown');
    var selectorText = selectorDisplay.querySelector('.selector-text');
    var totalCountEl = document.getElementById('ability-total-count');
    var targetCountEl = document.getElementById('target-count');
    var targetGroup = document.getElementById('target-group');
    var targetAddBtn = document.getElementById('target-add-btn');
    var knowledgeCanvas = document.getElementById('knowledge-canvas');
    var knowledgeSvg = document.getElementById('knowledge-svg');
    var knowledgeEmpty = document.getElementById('knowledge-empty');
    var knowledgeAssociBtn = document.getElementById('knowledge-associ-btn');

    var visibilityModal = document.getElementById('visibility-modal-overlay');
    var visibilityAbilityName = document.getElementById('visibility-ability-name');
    var visibilityCheckboxes = document.getElementById('visibility-checkboxes');
    var visibilityClose = document.getElementById('visibility-modal-close');
    var visibilityCancel = document.getElementById('visibility-btn-cancel');
    var visibilityConfirm = document.getElementById('visibility-btn-confirm');

    var knowledgeModal, knowledgeModalClose, knowledgeTreeContainer, knowledgeTreeCount, knowledgeSelectedCount, knowledgeSelectedList, knowledgeCancel, knowledgeConfirm;

    var currentEditingAbilityId = null;

    var tempSelectedKnowledge = [];

    /* ============================================================
     * 二、数据加载与持久化
     * ============================================================ */

    /**
     * 从 localStorage 加载能力数据
     *
     * 如果 localStorage 中没有数据，则使用默认的 3 条示例数据：
     *   - 能力1：关联 2 个知识点，无标签
     *   - 能力2：关联 4 个知识点，无标签
     *   - 能力3：关联 2 个知识点，带 2 个标签
     */
    function loadData() {
        var stored = StorageManager.get(STORAGE_KEY, null);
        if (stored) {
            abilities = stored;
        } else {
            abilities = [
                { id: 'a1', name: '能力1', knowledgeCount: 2, knowledgeIds: ['k1', 'k2'], tags: [], desc: '能力1描述', classes: ['all'], color: '#fdf9ed' },
                { id: 'a2', name: '能力2', knowledgeCount: 4, knowledgeIds: ['k3', 'k4', 'k5', 'k6'], tags: [], desc: '', classes: ['all'], color: '#e3f1ff' },
                { id: 'a3', name: '能力3', knowledgeCount: 2, knowledgeIds: ['k7', 'k8'], tags: ['能力3标签', '能力3标签2'], desc: '能力3描述', classes: ['all'], color: '#f0fbef' }
            ];
            saveData();
        }

        var storedTags = StorageManager.get('targetTags', null);
        tags = storedTags || ['标签1', '标签2', '标签3'];
    }

    /**
     * 保存能力数据到 localStorage
     */
    function saveData() {
        StorageManager.set(STORAGE_KEY, abilities);
    }

    /**
     * 加载班级列表
     *
     * @returns {Array<string>} 班级名称数组，默认 6 个班级
     */
    function loadClasses() {
        var stored = StorageManager.get(CLASS_KEY, null);
        if (stored) {
            return stored;
        }
        return ['一班', '二班', '三班', '四班', '五班', '六班'];
    }

    /**
     * 加载知识点树数据
     *
     * @returns {Array} 知识点树形数据，默认 4 个父级知识点
     */
    function loadKnowledgeTree() {
        var stored = StorageManager.get(KNOWLEDGE_KEY, null);
        if (stored) {
            return stored;
        }
        return [
            { id: 'k1', name: '身体协调', children: [{ id: 'k1-1', name: '上肢协调' }, { id: 'k1-2', name: '下肢协调' }] },
            { id: 'k2', name: '运动技能', children: [{ id: 'k2-1', name: '跑步技能' }, { id: 'k2-2', name: '跳跃技能' }, { id: 'k2-3', name: '投掷技能' }] },
            { id: 'k3', name: '理论知识', children: [{ id: 'k3-1', name: '运动生理' }, { id: 'k3-2', name: '运动心理' }] },
            { id: 'k4', name: '战术意识', children: [{ id: 'k4-1', name: '进攻战术' }, { id: 'k4-2', name: '防守战术' }] }
        ];
    }

    /* ============================================================
     * 三、数据筛选
     * ============================================================ */

    /**
     * 根据当前班级筛选能力列表
     *
     * @returns {Array} 过滤后的能力条目数组
     *
     * 筛选逻辑：
     *   - currentClass === 'all'：返回全部能力
     *   - 否则：返回 classes 包含 'all' 或当前班级的能力
     */
    function getFilteredAbilities() {
        if (currentClass === 'all') return abilities;
        return abilities.filter(function (a) {
            return a.classes.includes('all') || a.classes.includes(currentClass);
        });
    }

    /* ============================================================
     * 四、班级筛选器
     * ============================================================ */

    /**
     * 初始化班级选择下拉框
     *
     * 选项：
     *   - "全部班级"：显示所有能力
     *   - 各班级名：仅显示该班级可见的能力
     *
     * 交互：
     *   - 点击选择器展开/收起下拉列表
     *   - 选择后自动刷新所有视图
     *   - 点击页面其他区域关闭下拉框
     */
    function initClassSelector() {
        var classes = loadClasses();
        selectorDropdown.innerHTML = '<div class="selector-option selected" data-value="all">全部班级</div>';
        classes.forEach(function (cls) {
            var option = document.createElement('div');
            option.className = 'selector-option';
            option.setAttribute('data-value', cls);
            option.textContent = cls;
            selectorDropdown.appendChild(option);
        });

        selectorDisplay.addEventListener('click', function (e) {
            e.stopPropagation();
            classSelector.classList.toggle('open');
        });

        selectorDropdown.addEventListener('click', function (e) {
            var option = e.target.closest('.selector-option');
            if (!option) return;
            e.stopPropagation();
            var value = option.getAttribute('data-value');
            var text = option.textContent;
            currentClass = value;
            selectorText.textContent = text;
            selectorDropdown.querySelectorAll('.selector-option').forEach(function (o) { o.classList.remove('selected'); });
            option.classList.add('selected');
            classSelector.classList.remove('open');
            renderAll();
        });

        document.addEventListener('click', function () {
            classSelector.classList.remove('open');
        });
    }

    /* ============================================================
     * 五、ECharts 图表
     * ============================================================ */

    /**
     * 初始化 ECharts 柱状图实例
     * 绑定窗口 resize 事件以自适应图表大小
     */
    function initChart() {
        chartInstance = echarts.init(document.getElementById('chart-bar'));
        window.addEventListener('resize', function () {
            if (chartInstance) chartInstance.resize();
        });
    }

    /**
     * 更新柱状图数据
     *
     * 图表配置：
     *   - X 轴：能力名称（超过 8 个时标签旋转 30°）
     *   - Y 轴：关联知识点数量
     *   - 渐变色柱状图（蓝色渐变）
     *   - 悬浮提示显示具体数值
     */
    function updateChart() {
        var filteredAbilities = getFilteredAbilities();
        var names = filteredAbilities.map(function (a) { return a.name; });
        var counts = filteredAbilities.map(function (a) { return a.knowledgeCount; });
        var total = counts.reduce(function (sum, c) { return sum + c; }, 0);
        totalCountEl.textContent = total;

        var option = {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: function (params) {
                    return '关联知识点数：' + params[0].value;
                }
            },
            grid: {
                left: '3%',
                right: '4%',
                bottom: '3%',
                top: '10%',
                containLabel: true
            },
            xAxis: {
                type: 'category',
                data: names,
                axisLabel: {
                    fontSize: 12,
                    color: '#8a8b99',
                    rotate: names.length > 8 ? 30 : 0
                },
                axisLine: { lineStyle: { color: '#e4e7ed' } },
                axisTick: { show: false }
            },
            yAxis: {
                type: 'value',
                minInterval: 1,
                axisLabel: { fontSize: 12, color: '#8a8b99' },
                axisLine: { show: false },
                splitLine: { lineStyle: { color: '#f2f2f2' } }
            },
            series: [{
                type: 'bar',
                data: counts,
                barWidth: names.length > 10 ? 20 : 36,
                itemStyle: {
                    color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
                        { offset: 0, color: '#6cc7ff' },
                        { offset: 1, color: '#5a33ff' }
                    ]),
                    borderRadius: [4, 4, 0, 0]
                }
            }]
        };

        chartInstance.setOption(option);
    }

    /* ============================================================
     * 六、能力卡片渲染
     * ============================================================ */

    /**
     * 渲染能力卡片列表
     * 清空容器后重新创建所有卡片
     */
    function renderAbilities() {
        var filtered = getFilteredAbilities();
        targetCountEl.textContent = filtered.length;
        targetGroup.innerHTML = '';

        filtered.forEach(function (ability) {
            var item = createAbilityCard(ability);
            targetGroup.appendChild(item);
        });
    }

    /**
     * 创建单个能力卡片 DOM 元素
     *
     * @param {Object} ability - 能力数据对象
     * @returns {HTMLElement} 卡片 DOM 元素
     *
     * 卡片结构：
     *   - 拖拽手柄（排序用）
     *   - 删除按钮
     *   - 知识点数量标签
     *   - 能力名称
     *   - 标签列表
     *   - 描述文本
     *   - 开放班级按钮
     *
     * 交互：
     *   - 点击卡片 → 选中并展示知识点图谱
     *   - 点击删除 → 确认后删除
     *   - 点击开放班级 → 打开班级可见性弹窗
     *   - 拖拽手柄 → 排序
     */
    function createAbilityCard(ability) {
        var item = document.createElement('div');
        item.className = 'target-item' + (selectedAbilityId === ability.id ? ' target_active' : '');
        item.setAttribute('data-id', ability.id);
        item.style.backgroundColor = ability.color || '#fff';

        var tagsHtml = '';
        if (ability.tags && ability.tags.length > 0) {
            tagsHtml = '<ul class="target_label target_gap">' + ability.tags.map(function (t) { return '<li>' + t + '</li>'; }).join('') + '</ul>';
        }

        var descHtml = '';
        if (ability.desc) {
            descHtml = '<p class="target_text target_gap">' + ability.desc + '</p>';
        }

        item.innerHTML =
            '<a class="target_drag" href="javascript:"></a>' +
            '<a class="target_dele" data-id="' + ability.id + '"></a>' +
            '<div class="target_cont">' +
                '<span class="target_points target_gap">知识点数：' + ability.knowledgeCount + '</span>' +
                '<h3 class="target_title target_gap">' + ability.name + '</h3>' +
                tagsHtml +
                descHtml +
                '<p class="target_operate" >'+ 
                    '<span class="target_display" data-id="' + ability.id + '">开放班级</span>' +
                    '<span class="target_edit" data-id="' + ability.id + '">编辑</span>' +
                '</p>'
            '</div>';

        item.addEventListener('click', function (e) {
            if (e.target.closest('.target_dele') || e.target.closest('.target_display')|| e.target.closest('.target_edit') || e.target.closest('.target_drag')) return;
            selectAbility(ability.id);
        });

        item.querySelector('.target_dele').addEventListener('click', function (e) {
            e.stopPropagation();
            abilityEditor.confirm('该内容及其与知识点的关联关系将一并删除，确认删除？', function () {
                removeAbility(ability.id);
            });
        });

        item.querySelector('.target_display').addEventListener('click', function (e) {
            e.stopPropagation();
            showVisibilityModal(ability.id);
        });

        item.querySelector('.target_edit').addEventListener('click', function (e) {
            e.stopPropagation();
            if (abilityEditor) {
                abilityEditor.open(ability.id);
            }
        });

        item.querySelector('.target_drag').addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            startDrag(e, item, ability.id);
        });

        return item;
    }

    /**
     * 选中指定能力
     *
     * @param {string} id - 能力 ID
     *
     * 行为：
     *   - 重置 SVG 缩放和平移状态
     *   - 清除折叠状态
     *   - 高亮选中的卡片
     *   - 渲染该能力的知识点图谱
     */
    function selectAbility(id) {
        selectedAbilityId = id;
        svgScale = 1;
        svgPanX = 0;
        svgPanY = 0;
        collapsedNodes.clear();
        document.querySelectorAll('.target-item').forEach(function (item) {
            item.classList.toggle('target_active', item.getAttribute('data-id') === id);
        });
        renderKnowledgeGraph();
    }

    /**
     * 删除指定能力
     *
     * @param {string} id - 要删除的能力 ID
     */
    function removeAbility(id) {
        abilities = abilities.filter(function (a) { return a.id !== id; });
        if (selectedAbilityId === id) {
            selectedAbilityId = null;
        }
        saveData();
        renderAll();
    }

    /* ============================================================
     * 七、卡片拖拽排序
     * ============================================================ */

    /**
     * 开始拖拽排序
     *
     * @param {MouseEvent} e - 鼠标事件
     * @param {HTMLElement} item - 被拖拽的卡片元素
     * @param {string} id - 能力 ID
     *
     * 排序逻辑：
     *   - 监听 mousemove，根据鼠标位置动态调整卡片顺序
     *   - 当鼠标越过相邻卡片中线时触发位置交换
     *   - mouseup 时根据最终 DOM 顺序更新 abilities 数组
     */
    function startDrag(e, item, id) {
        dragItem = item;
        dragStartY = e.clientY;

        function onMove(e) {
            var items = Array.from(targetGroup.children);
            var currentItem = items.find(function (i) { return i === dragItem; });
            if (!currentItem) return;

            items.forEach(function (i) {
                if (i === dragItem) return;
                var r = i.getBoundingClientRect();
                var midY = r.top + r.height / 2;
                if (e.clientY < midY && currentItem.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_FOLLOWING) {
                    targetGroup.insertBefore(dragItem, i);
                } else if (e.clientY > midY && currentItem.compareDocumentPosition(i) & Node.DOCUMENT_POSITION_PRECEDING) {
                    targetGroup.insertBefore(dragItem, i.nextSibling);
                }
            });
        }

        function onUp() {
            document.removeEventListener('mousemove', onMove);
            document.removeEventListener('mouseup', onUp);
            var newOrder = Array.from(targetGroup.children).map(function (i) { return i.getAttribute('data-id'); });
            var reordered = [];
            newOrder.forEach(function (id) {
                var a = abilities.find(function (a) { return a.id === id; });
                if (a) reordered.push(a);
            });
            var remaining = abilities.filter(function (a) { return !newOrder.includes(a.id); });
            abilities = remaining.concat(reordered);
            saveData();
            dragItem = null;
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    /* ============================================================
     * 八、SVG 知识点图谱渲染
     * ============================================================ */

    /**
     * 渲染知识点关系图谱
     *
     * 渲染条件：
     *   - 必须选中一个能力
     *   - 该能力必须有关联的知识点
     *
     * 布局算法：
     *   1. 收集所有匹配的知识点（父级 + 独立子级）
     *   2. 父级节点排列在第一行（y=60）
     *   3. 父级下的已选子级排列在第二行（y=200），通过连线关联
     *   4. 独立子级（父级未被选中）也排列在第二行
     *   5. 节点水平间距自适应画布宽度
     */
    function renderKnowledgeGraph() {
        if (!selectedAbilityId) {
            knowledgeEmpty.style.display = 'flex';
            knowledgeSvg.style.display = 'none';
            return;
        }

        var ability = abilities.find(function (a) { return a.id === selectedAbilityId; });
        if (!ability || !ability.knowledgeIds || ability.knowledgeIds.length === 0) {
            knowledgeEmpty.style.display = 'flex';
            knowledgeSvg.style.display = 'none';
            return;
        }

        knowledgeEmpty.style.display = 'none';
        knowledgeSvg.style.display = 'block';

        var tree = loadKnowledgeTree();
        graphNodes = [];
        graphLinks = [];

        var centerX = knowledgeCanvas.clientWidth / 2;
        var checkedIds = new Set(ability.knowledgeIds);

        var matchedParents = [];
        var standaloneChildren = [];
        var childParentMap = new Map();

        function collectMatches(nodes) {
            if (!nodes) return;
            nodes.forEach(function (node) {
                if (checkedIds.has(node.id)) {
                    var hasChildren = node.children && node.children.length > 0;
                    if (hasChildren) {
                        matchedParents.push(node);
                    } else {
                        standaloneChildren.push(node);
                    }
                }
                if (node.children) {
                    node.children.forEach(function (child) {
                        childParentMap.set(child.id, node.id);
                    });
                    collectMatches(node.children);
                }
            });
        }
        collectMatches(tree);

        var finalStandaloneChildren = standaloneChildren.filter(function (child) {
            return !matchedParents.some(function (p) {
                return p.children && p.children.some(function (c) { return c.id === child.id; });
            });
        });

        var totalItems = matchedParents.length + finalStandaloneChildren.length;
        var spacing = Math.min(500, (knowledgeCanvas.clientWidth - 100) / Math.max(totalItems, 1));

        var parentX = centerX - (matchedParents.length - 1) * spacing / 2;
        if (matchedParents.length === 0) parentX = centerX;

        matchedParents.forEach(function (kn, i) {
            var nodeId = 'kn-' + kn.id;
            var checkedChildren = kn.children ? kn.children.filter(function (c) { return checkedIds.has(c.id); }) : [];
            var hasCheckedChildren = checkedChildren.length > 0;

            graphNodes.push({
                id: nodeId,
                name: kn.name,
                x: parentX + i * spacing,
                y: 60,
                type: 'knowledge',
                hasChildren: hasCheckedChildren
            });

            if (checkedChildren.length > 0) {
                var childSpacing = Math.min(130, spacing / Math.max(checkedChildren.length, 1));
                var childStartX = parentX + i * spacing - (checkedChildren.length - 1) * childSpacing / 2;
                checkedChildren.forEach(function (child, j) {
                    var childId = 'kn-' + child.id;
                    graphNodes.push({
                        id: childId,
                        name: child.name,
                        x: childStartX + j * childSpacing,
                        y: 200,
                        type: 'child',
                        hasChildren: false,
                        parentId: nodeId
                    });
                    graphLinks.push({ source: nodeId, target: childId });
                });
            }
        });

        if (finalStandaloneChildren.length > 0) {
            var childStartX = centerX - (finalStandaloneChildren.length - 1) * spacing / 2;
            finalStandaloneChildren.forEach(function (child, i) {
                var childId = 'kn-' + child.id;
                graphNodes.push({
                    id: childId,
                    name: child.name,
                    x: childStartX + i * spacing,
                    y: 200,
                    type: 'child',
                    hasChildren: false,
                    parentId: null
                });
            });
        }

        drawSvgGraph();
    }

    /**
     * 在知识点树中查找指定 ID 集合的节点
     *
     * @param {Array} tree - 知识点树
     * @param {Array<string>} ids - 要查找的 ID 列表
     * @returns {Array} 匹配的节点数组
     */
    function findKnowledgeNodes(tree, ids) {
        var result = [];
        function traverse(nodes) {
            if (!nodes) return;
            nodes.forEach(function (node) {
                if (ids.includes(node.id)) {
                    result.push(node);
                }
                if (node.children) traverse(node.children);
            });
        }
        traverse(tree);
        return result;
    }

    /**
     * 获取可见的节点和连线（排除折叠的节点）
     *
     * @returns {Object} { visibleNodes, visibleLinks, hiddenIds }
     */
    function getVisibleNodesAndLinks() {
        var hiddenIds = new Set();
        collapsedNodes.forEach(function (parentId) {
            graphLinks.forEach(function (link) {
                if (link.source === parentId) {
                    hiddenIds.add(link.target);
                    collectDescendants(link.target, hiddenIds);
                }
            });
        });

        var visibleNodes = graphNodes.filter(function (n) { return !hiddenIds.has(n.id); });
        var visibleLinks = graphLinks.filter(function (l) { return !hiddenIds.has(l.source) && !hiddenIds.has(l.target); });
        return { visibleNodes: visibleNodes, visibleLinks: visibleLinks, hiddenIds: hiddenIds };
    }

    /**
     * 递归收集所有后代节点 ID
     *
     * @param {string} parentId - 父节点 ID
     * @param {Set<string>} hiddenIds - 隐藏节点 ID 集合
     */
    function collectDescendants(parentId, hiddenIds) {
        graphLinks.forEach(function (link) {
            if (link.source === parentId) {
                hiddenIds.add(link.target);
                collectDescendants(link.target, hiddenIds);
            }
        });
    }

    /**
     * 绘制 SVG 图谱
     *
     * 绘制内容：
     *   - defs：渐变和箭头标记定义
     *   - 连线组：贝塞尔曲线连线（带箭头）
     *   - 节点组：圆形节点 + 文字标签
     *   - 折叠/展开按钮（父节点下方）
     *
     * 交互：
     *   - 节点拖拽（长按 200ms 激活）
     *   - 折叠按钮点击
     *   - 画布平移（空白区域拖拽）
     *   - 鼠标滚轮缩放
     */
    function drawSvgGraph() {
        knowledgeSvg.innerHTML = '';
        var svgNS = 'http://www.w3.org/2000/svg';

        var defs = document.createElementNS(svgNS, 'defs');

        var parentGrad = document.createElementNS(svgNS, 'radialGradient');
        parentGrad.setAttribute('id', 'parent-node-grad');
        parentGrad.setAttribute('cx', '35%');
        parentGrad.setAttribute('cy', '35%');
        parentGrad.setAttribute('r', '65%');
        var parentStop1 = document.createElementNS(svgNS, 'stop');
        parentStop1.setAttribute('offset', '0%');
        parentStop1.setAttribute('stop-color', '#17e6f5ff');
        parentGrad.appendChild(parentStop1);
        var parentStop2 = document.createElementNS(svgNS, 'stop');
        parentStop2.setAttribute('offset', '100%');
        parentStop2.setAttribute('stop-color', '#bed8b8ff');
        parentGrad.appendChild(parentStop2);
        defs.appendChild(parentGrad);

        var childGrad = document.createElementNS(svgNS, 'radialGradient');
        childGrad.setAttribute('id', 'child-node-grad');
        childGrad.setAttribute('cx', '35%');
        childGrad.setAttribute('cy', '35%');
        childGrad.setAttribute('r', '65%');
        var childStop1 = document.createElementNS(svgNS, 'stop');
        childStop1.setAttribute('offset', '0%');
        childStop1.setAttribute('stop-color', '#f0d09aff');
        childGrad.appendChild(childStop1);
        var childStop2 = document.createElementNS(svgNS, 'stop');
        childStop2.setAttribute('offset', '100%');
        childStop2.setAttribute('stop-color', '#abf05cff');
        childGrad.appendChild(childStop2);
        defs.appendChild(childGrad);

        var marker = document.createElementNS(svgNS, 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '8');
        marker.setAttribute('markerHeight', '6');
        marker.setAttribute('refX', '8');
        marker.setAttribute('refY', '3');
        marker.setAttribute('orient', 'auto');
        marker.setAttribute('markerUnits', 'userSpaceOnUse');
        var path = document.createElementNS(svgNS, 'path');
        path.setAttribute('d', 'M0,0 L8,3 L0,6 L2,3 Z');
        path.setAttribute('fill', '#b8babeff');
        marker.appendChild(path);
        defs.appendChild(marker);
        knowledgeSvg.appendChild(defs);

        var mainGroup = document.createElementNS(svgNS, 'g');
        mainGroup.setAttribute('id', 'svg-main-group');
        mainGroup.setAttribute('transform', 'translate(' + svgPanX + ',' + svgPanY + ') scale(' + svgScale + ')');
        knowledgeSvg.appendChild(mainGroup);

        var visibleData = getVisibleNodesAndLinks();
        var visibleNodes = visibleData.visibleNodes;
        var visibleLinks = visibleData.visibleLinks;

        var linksGroup = document.createElementNS(svgNS, 'g');
        linksGroup.setAttribute('class', 'svg-links-group');
        mainGroup.appendChild(linksGroup);

        visibleLinks.forEach(function (link) {
            var source = graphNodes.find(function (n) { return n.id === link.source; });
            var target = graphNodes.find(function (n) { return n.id === link.target; });
            if (!source || !target) return;

            var sourceR = source.type === 'knowledge' ? 22 : 18;
            var targetR = target.type === 'child' ? 18 : 22;

            var line = document.createElementNS(svgNS, 'path');
            var sx = source.x;
            var sy = source.y + sourceR + 4;
            var tx = target.x;
            var ty = target.y - targetR - 8;
            var midY = (sy + ty) / 2;
            var d = 'M' + sx + ',' + sy + ' C' + sx + ',' + midY + ' ' + tx + ',' + midY + ' ' + tx + ',' + ty;
            line.setAttribute('d', d);
            line.setAttribute('stroke', '#c0c4cc');
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('fill', 'none');
            line.setAttribute('marker-end', 'url(#arrowhead)');
            line.setAttribute('data-source', link.source);
            line.setAttribute('data-target', link.target);
            linksGroup.appendChild(line);
        });

        var nodesGroup = document.createElementNS(svgNS, 'g');
        nodesGroup.setAttribute('class', 'svg-nodes-group');
        mainGroup.appendChild(nodesGroup);

        visibleNodes.forEach(function (node) {
            var g = document.createElementNS(svgNS, 'g');
            g.setAttribute('class', 'svg-node');
            g.setAttribute('data-id', node.id);
            g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
            g.style.cursor = 'grab';

            var r = node.type === 'knowledge' ? 22 : 18;
            var gradId = node.type === 'knowledge' ? 'url(#parent-node-grad)' : 'url(#child-node-grad)';
            var strokeColor = node.type === 'knowledge' ? '#52b83b' : '#d9942e';

            var circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('cx', '0');
            circle.setAttribute('cy', '0');
            circle.setAttribute('r', r);
            circle.setAttribute('fill', gradId);
            g.appendChild(circle);

            var fontSize = r === 22 ? '12' : '11';

            var nameText = document.createElementNS(svgNS, 'text');
            nameText.setAttribute('x', '0');
            nameText.setAttribute('y', '1');
            nameText.setAttribute('text-anchor', 'middle');
            nameText.setAttribute('dominant-baseline', 'middle');
            nameText.setAttribute('font-size', fontSize);
            nameText.setAttribute('fill', '#000');
            nameText.setAttribute('font-weight', '600');
            nameText.setAttribute('style', 'pointer-events: none;');
            nameText.textContent = node.name;
            g.appendChild(nameText);

            if (node.hasChildren) {
                var isCollapsed = collapsedNodes.has(node.id);
                var toggleY = r + 4;

                var toggleBg = document.createElementNS(svgNS, 'circle');
                toggleBg.setAttribute('cx', '0');
                toggleBg.setAttribute('cy', String(toggleY));
                toggleBg.setAttribute('r', '10');
                toggleBg.setAttribute('fill', '#fff');
                toggleBg.setAttribute('stroke', strokeColor);
                toggleBg.setAttribute('stroke-width', '1.5');
                toggleBg.setAttribute('class', 'toggle-btn');
                toggleBg.setAttribute('data-node-id', node.id);
                toggleBg.style.cursor = 'pointer';
                g.appendChild(toggleBg);

                var toggleText = document.createElementNS(svgNS, 'text');
                toggleText.setAttribute('x', '0');
                toggleText.setAttribute('y', String(toggleY + 1));
                toggleText.setAttribute('text-anchor', 'middle');
                toggleText.setAttribute('dominant-baseline', 'middle');
                toggleText.setAttribute('font-size', '14');
                toggleText.setAttribute('font-weight', '700');
                toggleText.setAttribute('fill', strokeColor);
                toggleText.setAttribute('class', 'toggle-btn');
                toggleText.setAttribute('data-node-id', node.id);
                toggleText.style.cursor = 'pointer';
                toggleText.textContent = isCollapsed ? '+' : '\u2212';
                g.appendChild(toggleText);
            }

            g.addEventListener('mousedown', function (e) {
                if (e.target.classList.contains('toggle-btn')) return;
                e.preventDefault();
                e.stopPropagation();
                isLongPress = false;
                var startX = e.clientX;
                var startY = e.clientY;
                dragNodeId = node.id;
                dragNodeStartX = node.x;
                dragNodeStartY = node.y;

                longPressTimer = setTimeout(function () {
                    isLongPress = true;
                    isDraggingNode = true;
                    g.style.cursor = 'grabbing';
                }, 200);

                function onNodeMove(e) {
                    var dx = e.clientX - startX;
                    var dy = e.clientY - startY;
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                        clearTimeout(longPressTimer);
                        if (!isDraggingNode) {
                            isDraggingNode = true;
                            g.style.cursor = 'grabbing';
                        }
                    }
                    if (isDraggingNode) {
                        var n = graphNodes.find(function (n) { return n.id === dragNodeId; });
                        if (n) {
                            n.x = dragNodeStartX + dx / svgScale;
                            n.y = dragNodeStartY + dy / svgScale;
                            g.setAttribute('transform', 'translate(' + n.x + ',' + n.y + ')');
                            updateLinks();
                        }
                    }
                }

                function onNodeUp() {
                    clearTimeout(longPressTimer);
                    document.removeEventListener('mousemove', onNodeMove);
                    document.removeEventListener('mouseup', onNodeUp);
                    isDraggingNode = false;
                    dragNodeId = null;
                    g.style.cursor = 'grab';
                }

                document.addEventListener('mousemove', onNodeMove);
                document.addEventListener('mouseup', onNodeUp);
            });

            g.addEventListener('click', function (e) {
                if (isDraggingNode) return;
            });

            nodesGroup.appendChild(g);
        });

        knowledgeSvg.querySelectorAll('.toggle-btn').forEach(function (btn) {
            btn.addEventListener('mousedown', function (e) {
                e.stopPropagation();
            });
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                var nodeId = this.getAttribute('data-node-id');
                if (collapsedNodes.has(nodeId)) {
                    collapsedNodes.delete(nodeId);
                } else {
                    collapsedNodes.add(nodeId);
                }
                drawSvgGraph();
            });
        });

        initSvgPanZoom();
        updateZoomDisplay();
    }

    /**
     * 更新连线位置（节点拖拽后调用）
     * 重新计算所有可见连线的贝塞尔曲线路径
     */
    function updateLinks() {
        var visibleData = getVisibleNodesAndLinks();
        var visibleLinks = visibleData.visibleLinks;
        var linksGroup = knowledgeSvg.querySelector('.svg-links-group');
        if (!linksGroup) return;

        var svgNS = 'http://www.w3.org/2000/svg';
        linksGroup.innerHTML = '';

        visibleLinks.forEach(function (link) {
            var source = graphNodes.find(function (n) { return n.id === link.source; });
            var target = graphNodes.find(function (n) { return n.id === link.target; });
            if (!source || !target) return;

            var sourceR = source.type === 'root' ? 28 : 22;
            var targetR = target.type === 'child' ? 18 : 22;

            var line = document.createElementNS(svgNS, 'path');
            var sx = source.x;
            var sy = source.y + sourceR + 4;
            var tx = target.x;
            var ty = target.y - targetR - 8;
            var midY = (sy + ty) / 2;
            var d = 'M' + sx + ',' + sy + ' C' + sx + ',' + midY + ' ' + tx + ',' + midY + ' ' + tx + ',' + ty;
            line.setAttribute('d', d);
            line.setAttribute('stroke', '#c0c4cc');
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('fill', 'none');
            line.setAttribute('marker-end', 'url(#arrowhead)');
            linksGroup.appendChild(line);
        });
    }

    /* ============================================================
     * 九、SVG 画布平移与缩放
     * ============================================================ */

    /**
     * 初始化 SVG 画布的平移和缩放交互
     *
     * 缩放：鼠标滚轮，以鼠标位置为中心缩放（范围 20%~300%）
     * 平移：在空白区域按住鼠标拖拽
     */
    function initSvgPanZoom() {
        knowledgeSvg.onwheel = function (e) {
            e.preventDefault();
            var delta = e.deltaY > 0 ? -0.1 : 0.1;
            var newScale = Math.max(0.2, Math.min(3, svgScale + delta));

            var rect = knowledgeSvg.getBoundingClientRect();
            var mouseX = e.clientX - rect.left;
            var mouseY = e.clientY - rect.top;

            var scaleRatio = newScale / svgScale;
            svgPanX = mouseX - scaleRatio * (mouseX - svgPanX);
            svgPanY = mouseY - scaleRatio * (mouseY - svgPanY);
            svgScale = newScale;

            var mainGroup = knowledgeSvg.querySelector('#svg-main-group');
            if (mainGroup) {
                mainGroup.setAttribute('transform', 'translate(' + svgPanX + ',' + svgPanY + ') scale(' + svgScale + ')');
            }
            updateZoomDisplay();
        };

        knowledgeSvg.onmousedown = function (e) {
            if (e.target.closest('.svg-node') || e.target.classList.contains('toggle-btn')) return;
            e.preventDefault();
            isPanning = true;
            panStartX = e.clientX - svgPanX;
            panStartY = e.clientY - svgPanY;
            knowledgeSvg.style.cursor = 'move';
        };

        document.addEventListener('mousemove', function (e) {
            if (!isPanning) return;
            svgPanX = e.clientX - panStartX;
            svgPanY = e.clientY - panStartY;
            var mainGroup = knowledgeSvg.querySelector('#svg-main-group');
            if (mainGroup) {
                mainGroup.setAttribute('transform', 'translate(' + svgPanX + ',' + svgPanY + ') scale(' + svgScale + ')');
            }
        });

        document.addEventListener('mouseup', function () {
            if (isPanning) {
                isPanning = false;
                knowledgeSvg.style.cursor = 'default';
            }
        });
    }

    /**
     * 更新缩放百分比显示（SVG 左上角）
     */
    function updateZoomDisplay() {
        var display = knowledgeSvg.querySelector('.zoom-display');
        if (!display) {
            display = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            display.setAttribute('class', 'zoom-display');
            display.setAttribute('x', '10');
            display.setAttribute('y', '20');
            display.setAttribute('font-size', '12');
            display.setAttribute('fill', '#999');
            display.style.pointerEvents = 'none';
            knowledgeSvg.appendChild(display);
        }
        display.textContent = Math.round(svgScale * 100) + '%';
    }

    /* ============================================================
     * 十、开放班级弹窗
     * ============================================================ */

    /**
     * 显示班级可见性设置弹窗
     *
     * @param {string} abilityId - 能力 ID
     *
     * 弹窗内容：
     *   - "全部班级"复选框（选中后其他班级自动禁用）
     *   - 各班级复选框
     *
     * 逻辑：
     *   - 选中"全部班级" → classes = ['all']
     *   - 取消"全部班级" → classes = 选中的班级列表
     */
    function showVisibilityModal(abilityId) {
        currentEditingAbilityId = abilityId;
        var ability = abilities.find(function (a) { return a.id === abilityId; });
        if (!ability) return;

        visibilityAbilityName.textContent = '名称：' + ability.name;
        var classes = loadClasses();
        visibilityCheckboxes.innerHTML = '';

        var allLabel = document.createElement('label');
        allLabel.className = 'checkbox-item checkbox-all';
        allLabel.innerHTML =
            '<input type="checkbox" id="visibility-all-classes"' + (ability.classes.includes('all') ? ' checked' : '') + '>' +
            '<span class="checkbox-custom"></span>' +
            '<span class="checkbox-text">全部班级</span>';
        visibilityCheckboxes.appendChild(allLabel);

        var allInput = allLabel.querySelector('input');
        allInput.addEventListener('change', function () {
            var checkboxes = visibilityCheckboxes.querySelectorAll('.checkbox-item:not(.checkbox-all) input');
            checkboxes.forEach(function (cb) { cb.checked = allInput.checked; cb.disabled = allInput.checked; });
        });

        classes.forEach(function (cls) {
            var label = document.createElement('label');
            label.className = 'checkbox-item';
            var isChecked = ability.classes.includes('all') || ability.classes.includes(cls);
            label.innerHTML =
                '<input type="checkbox" data-class="' + cls + '"' + (isChecked ? ' checked' : '') + (ability.classes.includes('all') ? ' disabled' : '') + '>' +
                '<span class="checkbox-custom"></span>' +
                '<span class="checkbox-text">' + cls + '</span>';
            visibilityCheckboxes.appendChild(label);
        });

        visibilityModal.classList.add('show');
    }

    /* ============================================================
     * 十一、知识点关联编辑弹窗
     * ============================================================ */

    /**
     * 显示知识点选择弹窗
     *
     * @param {Array<string>} selectedIds - 当前已选中的知识点 ID 列表
     */
    function showKnowledgeModal(selectedIds) {
        tempSelectedKnowledge = selectedIds ? selectedIds.slice() : [];
        var tree = loadKnowledgeTree();
        renderKnowledgeTree(tree);
        updateKnowledgeSelectedList();
        knowledgeModal.classList.add('show');
    }

    /**
     * 渲染知识点树
     *
     * @param {Array} tree - 知识点树形数据
     */
    function renderKnowledgeTree(tree) {
        knowledgeTreeContainer.innerHTML = '';
        var totalCount = 0;
        function countNodes(nodes) {
            nodes.forEach(function (n) {
                totalCount++;
                if (n.children) countNodes(n.children);
            });
        }
        countNodes(tree);
        knowledgeTreeCount.textContent = totalCount;

        tree.forEach(function (node) {
            knowledgeTreeContainer.appendChild(createTreeNode(node, 0));
        });
    }

    /**
     * 递归创建知识点树节点 DOM
     *
     * @param {Object} node - 知识点节点数据
     * @param {number} level - 层级深度
     * @returns {HTMLElement} 树节点 DOM 元素
     */
    function createTreeNode(node, level) {
        var li = document.createElement('li');
        li.setAttribute('data-id', node.id);
        var hasChildren = node.children && node.children.length > 0;

        var main = document.createElement('div');
        main.className = 'tree-main';
        main.style.paddingLeft = (14 + level * 20) + 'px';

        if (hasChildren) {
            var arrow = document.createElement('span');
            arrow.className = 'tree-arrow';
            arrow.innerHTML = '<i class="fas fa-chevron-right"></i>';
            arrow.addEventListener('click', function (e) {
                e.stopPropagation();
                arrow.classList.toggle('expanded');
                var children = li.querySelector('.tree-children');
                if (children) children.classList.toggle('expanded');
            });
            main.appendChild(arrow);
        } else {
            var spacer = document.createElement('span');
            spacer.style.width = '20px';
            spacer.style.display = 'inline-block';
            spacer.style.flexShrink = '0';
            main.appendChild(spacer);
        }

        var text = document.createElement('span');
        text.className = 'tree-text';
        text.textContent = node.name;
        text.addEventListener('click', function () {
            if (hasChildren) {
                var arrowEl = main.querySelector('.tree-arrow');
                if (arrowEl) {
                    arrowEl.classList.toggle('expanded');
                    var children = li.querySelector('.tree-children');
                    if (children) children.classList.toggle('expanded');
                }
            }
        });
        main.appendChild(text);

        var check = document.createElement('span');
        check.className = 'tree-check' + (tempSelectedKnowledge.includes(node.id) ? ' checked' : '');
        check.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleKnowledgeSelection(node.id);
            check.classList.toggle('checked');
        });
        main.appendChild(check);

        main.addEventListener('click', function (e) {
            if (e.target.closest('.tree-check')) return;
            if (hasChildren) {
                var arrowEl = main.querySelector('.tree-arrow');
                if (arrowEl) {
                    arrowEl.classList.toggle('expanded');
                    var children = li.querySelector('.tree-children');
                    if (children) children.classList.toggle('expanded');
                }
            }
        });

        li.appendChild(main);

        if (hasChildren) {
            var childrenUl = document.createElement('ul');
            childrenUl.className = 'tree-children';
            node.children.forEach(function (child) {
                childrenUl.appendChild(createTreeNode(child, level + 1));
            });
            li.appendChild(childrenUl);

            if (tempSelectedKnowledge.some(function (id) {
                return node.children.some(function (c) { return c.id === id; });
            })) {
                var arrowEl = main.querySelector('.tree-arrow');
                if (arrowEl) arrowEl.classList.add('expanded');
                childrenUl.classList.add('expanded');
            }
        }

        return li;
    }

    /**
     * 切换知识点选中状态
     *
     * @param {string} id - 知识点 ID
     */
    function toggleKnowledgeSelection(id) {
        var idx = tempSelectedKnowledge.indexOf(id);
        if (idx >= 0) {
            tempSelectedKnowledge.splice(idx, 1);
        } else {
            tempSelectedKnowledge.push(id);
        }
        updateKnowledgeSelectedList();
    }

    /**
     * 更新知识点弹窗底部已选列表
     */
    function updateKnowledgeSelectedList() {
        knowledgeSelectedCount.textContent = tempSelectedKnowledge.length;
        knowledgeSelectedList.innerHTML = '';

        var tree = loadKnowledgeTree();
        tempSelectedKnowledge.forEach(function (id) {
            var name = findKnowledgeName(tree, id);
            if (!name) return;
            var div = document.createElement('div');
            div.className = 'knowledge-selected-item';
            div.innerHTML = '<span>' + name + '</span><span class="remove-btn" data-id="' + id + '"></span>';
            div.querySelector('.remove-btn').addEventListener('click', function () {
                toggleKnowledgeSelection(id);
                renderKnowledgeTree(tree);
                updateKnowledgeSelectedList();
            });
            knowledgeSelectedList.appendChild(div);
        });
    }

    /**
     * 在知识点树中递归查找名称
     *
     * @param {Array} tree - 知识点树
     * @param {string} id - 知识点 ID
     * @returns {string|null} 知识点名称
     */
    function findKnowledgeName(tree, id) {
        for (var i = 0; i < tree.length; i++) {
            var node = tree[i];
            if (node.id === id) return node.name;
            if (node.children) {
                var result = findKnowledgeName(node.children, id);
                if (result) return result;
            }
        }
        return null;
    }

    /* ============================================================
     * 十二、确认弹窗
     * ============================================================ */

    /* ============================================================
     * 十三、事件绑定与初始化
     * ============================================================ */

    /**
     * 全局刷新所有视图
     * 更新图表 → 渲染卡片 → 渲染图谱
     * 如果没有选中能力且有可用能力，自动选中第一个
     */
    function renderAll() {
        updateChart();
        renderAbilities();
        renderKnowledgeGraph();
        if (!selectedAbilityId && abilities.length > 0) {
            selectAbility(abilities[0].id);
        }
    }

    // --- 开放班级弹窗事件 ---

    visibilityClose.addEventListener('click', function () { visibilityModal.classList.remove('show'); });
    visibilityCancel.addEventListener('click', function () { visibilityModal.classList.remove('show'); });

    /**
     * 开放班级确认按钮 - 保存班级可见性配置
     */
    visibilityConfirm.addEventListener('click', function () {
        var ability = abilities.find(function (a) { return a.id === currentEditingAbilityId; });
        if (!ability) return;

        var allCb = visibilityCheckboxes.querySelector('#visibility-all-classes');
        if (allCb.checked) {
            ability.classes = ['all'];
        } else {
            ability.classes = [];
            visibilityCheckboxes.querySelectorAll('.checkbox-item:not(.checkbox-all) input:checked').forEach(function (cb) {
                ability.classes.push(cb.getAttribute('data-class'));
            });
        }
        saveData();
        visibilityModal.classList.remove('show');
    });

    // --- 导航按钮 ---

    /**
     * 添加能力按钮 - 跳转到目标管理页面
     */
    targetAddBtn.addEventListener('click', function () {
        window.location.href = 'targetManagement.html';
    });

    // --- 应用初始化入口 ---

    /**
     * 应用初始化
     * 加载数据 → 初始化班级筛选器 → 初始化图表 → 渲染所有视图
     */
    async function init() {
        loadData();
        initClassSelector();
        initChart();

        abilityEditor = await new AbilityEdit({
            getAbilities: function () { return abilities; },
            saveAbilities: function () { saveData(); },
            getTags: function () {
                return tags;
            },
            saveTags: function () {
                StorageManager.set('targetTags', tags);
            },
            getKnowledgeTree: function () { return loadKnowledgeTree(); },
            onSaved: function (ability) { renderAll(); },
            tagColors: ['#F77763', '#67c23a', '#5AC482', '#409eff', '#e6a23c']
        });

        knowledgeModal = document.getElementById('knowledge-modal-overlay');
        knowledgeModalClose = document.getElementById('knowledge-modal-close');
        knowledgeTreeContainer = document.getElementById('knowledge-tree');
        knowledgeTreeCount = document.getElementById('knowledge-tree-count');
        knowledgeSelectedCount = document.getElementById('knowledge-selected-count');
        knowledgeSelectedList = document.getElementById('knowledge-selected-list');
        knowledgeCancel = document.getElementById('knowledge-btn-cancel');
        knowledgeConfirm = document.getElementById('knowledge-btn-confirm');

        knowledgeModalClose.addEventListener('click', function () {
            window._abilityEditKnowledgeMode = false;
            knowledgeModal.classList.remove('show');
        });
        knowledgeCancel.addEventListener('click', function () {
            window._abilityEditKnowledgeMode = false;
            knowledgeModal.classList.remove('show');
        });
        knowledgeConfirm.addEventListener('click', function () {
            if (window._abilityEditKnowledgeMode) return;
            if (currentEditingAbilityId) {
                var ability = abilities.find(function (a) { return a.id === currentEditingAbilityId; });
                if (ability) {
                    ability.knowledgeIds = tempSelectedKnowledge.slice();
                    ability.knowledgeCount = tempSelectedKnowledge.length;
                    saveData();
                    renderAll();
                }
            }
            knowledgeModal.classList.remove('show');
        });
        knowledgeAssociBtn.addEventListener('click', function () {
            if (!selectedAbilityId) return;
            currentEditingAbilityId = selectedAbilityId;
            var ability = abilities.find(function (a) { return a.id === selectedAbilityId; });
            showKnowledgeModal(ability ? ability.knowledgeIds : []);
        });

        renderAll();
    }

    init();
})();
