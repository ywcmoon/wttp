(function () {
    'use strict';

    const STORAGE_KEY = 'abilityMapData';
    const CLASS_KEY = 'abilityMapClasses';
    const KNOWLEDGE_KEY = 'knowledgeTreeData';

    let abilities = [];
    let selectedAbilityId = null;
    let currentClass = 'all';
    let chartInstance = null;
    let dragItem = null;
    let dragStartY = 0;

    let svgScale = 1;
    let svgPanX = 0;
    let svgPanY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let isDraggingNode = false;
    let dragNodeId = null;
    let dragNodeStartX = 0;
    let dragNodeStartY = 0;
    let longPressTimer = null;
    let isLongPress = false;
    let graphNodes = [];
    let graphLinks = [];
    let collapsedNodes = new Set();

    const classSelector = document.getElementById('class-selector');
    const selectorDisplay = document.getElementById('selector-display');
    const selectorDropdown = document.getElementById('selector-dropdown');
    const selectorText = selectorDisplay.querySelector('.selector-text');
    const totalCountEl = document.getElementById('ability-total-count');
    const targetCountEl = document.getElementById('target-count');
    const targetGroup = document.getElementById('target-group');
    const targetAddBtn = document.getElementById('target-add-btn');
    const knowledgeCanvas = document.getElementById('knowledge-canvas');
    const knowledgeSvg = document.getElementById('knowledge-svg');
    const knowledgeEmpty = document.getElementById('knowledge-empty');
    const knowledgeAssociBtn = document.getElementById('knowledge-associ-btn');

    const visibilityModal = document.getElementById('visibility-modal-overlay');
    const visibilityAbilityName = document.getElementById('visibility-ability-name');
    const visibilityCheckboxes = document.getElementById('visibility-checkboxes');
    const visibilityClose = document.getElementById('visibility-modal-close');
    const visibilityCancel = document.getElementById('visibility-btn-cancel');
    const visibilityConfirm = document.getElementById('visibility-btn-confirm');

    const knowledgeModal = document.getElementById('knowledge-modal-overlay');
    const knowledgeModalClose = document.getElementById('knowledge-modal-close');
    const knowledgeTreeContainer = document.getElementById('knowledge-tree');
    const knowledgeTreeCount = document.getElementById('knowledge-tree-count');
    const knowledgeSelectedCount = document.getElementById('knowledge-selected-count');
    const knowledgeSelectedList = document.getElementById('knowledge-selected-list');
    const knowledgeCancel = document.getElementById('knowledge-btn-cancel');
    const knowledgeConfirm = document.getElementById('knowledge-btn-confirm');

    const confirmModal = document.getElementById('confirm-modal-overlay');
    const confirmText = document.getElementById('confirm-text');
    const confirmClose = document.getElementById('confirm-modal-close');
    const confirmCancel = document.getElementById('confirm-btn-cancel');
    const confirmConfirm = document.getElementById('confirm-btn-confirm');

    let currentEditingAbilityId = null;
    let tempSelectedKnowledge = [];
    let confirmCallback = null;

    function loadData() {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            abilities = JSON.parse(stored);
        } else {
            abilities = [
                { id: 'a1', name: '能力1', knowledgeCount: 2, knowledgeIds: ['k1', 'k2'], tags: [], desc: '能力1描述', classes: ['all'], color: '#fdf9ed' },
                { id: 'a2', name: '能力2', knowledgeCount: 4, knowledgeIds: ['k3', 'k4', 'k5', 'k6'], tags: [], desc: '', classes: ['all'], color: '#e3f1ff' },
                { id: 'a3', name: '能力3', knowledgeCount: 2, knowledgeIds: ['k7', 'k8'], tags: ['能力3标签', '能力3标签2'], desc: '能力3描述', classes: ['all'], color: '#f0fbef' }
            ];
            saveData();
        }
    }

    function saveData() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(abilities));
    }

    function loadClasses() {
        const stored = localStorage.getItem(CLASS_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
        return ['一班', '二班', '三班', '四班', '五班', '六班'];
    }

    function loadKnowledgeTree() {
        const stored = localStorage.getItem(KNOWLEDGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
        return [
            { id: 'k1', name: '身体协调', children: [{ id: 'k1-1', name: '上肢协调' }, { id: 'k1-2', name: '下肢协调' }] },
            { id: 'k2', name: '运动技能', children: [{ id: 'k2-1', name: '跑步技能' }, { id: 'k2-2', name: '跳跃技能' }, { id: 'k2-3', name: '投掷技能' }] },
            { id: 'k3', name: '理论知识', children: [{ id: 'k3-1', name: '运动生理' }, { id: 'k3-2', name: '运动心理' }] },
            { id: 'k4', name: '战术意识', children: [{ id: 'k4-1', name: '进攻战术' }, { id: 'k4-2', name: '防守战术' }] }
        ];
    }

    function initClassSelector() {
        const classes = loadClasses();
        selectorDropdown.innerHTML = '<div class="selector-option selected" data-value="all">全部班级</div>';
        classes.forEach(cls => {
            const option = document.createElement('div');
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
            const option = e.target.closest('.selector-option');
            if (!option) return;
            e.stopPropagation();
            const value = option.getAttribute('data-value');
            const text = option.textContent;
            currentClass = value;
            selectorText.textContent = text;
            selectorDropdown.querySelectorAll('.selector-option').forEach(o => o.classList.remove('selected'));
            option.classList.add('selected');
            classSelector.classList.remove('open');
            renderAll();
        });

        document.addEventListener('click', function () {
            classSelector.classList.remove('open');
        });
    }

    function initChart() {
        chartInstance = echarts.init(document.getElementById('chart-bar'));
        window.addEventListener('resize', function () {
            if (chartInstance) chartInstance.resize();
        });
    }

    function updateChart() {
        const filteredAbilities = getFilteredAbilities();
        const names = filteredAbilities.map(a => a.name);
        const counts = filteredAbilities.map(a => a.knowledgeCount);
        const total = counts.reduce((sum, c) => sum + c, 0);
        totalCountEl.textContent = total;

        const option = {
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

    function getFilteredAbilities() {
        if (currentClass === 'all') return abilities;
        return abilities.filter(a => a.classes.includes('all') || a.classes.includes(currentClass));
    }

    function renderAbilities() {
        const filtered = getFilteredAbilities();
        targetCountEl.textContent = filtered.length;
        targetGroup.innerHTML = '';

        filtered.forEach(ability => {
            const item = createAbilityCard(ability);
            targetGroup.appendChild(item);
        });
    }

    function createAbilityCard(ability) {
        const item = document.createElement('div');
        item.className = 'target-item' + (selectedAbilityId === ability.id ? ' target_active' : '');
        item.setAttribute('data-id', ability.id);
        item.style.backgroundColor = ability.color || '#fff';

        let tagsHtml = '';
        if (ability.tags && ability.tags.length > 0) {
            tagsHtml = '<ul class="target_label">' + ability.tags.map(t => '<li>' + t + '</li>').join('') + '</ul>';
        }

        let descHtml = '';
        if (ability.desc) {
            descHtml = '<div class="target_text">' + ability.desc + '</div>';
        }

        item.innerHTML =
            '<a class="target_drag" href="javascript:"></a>' +
            '<a class="target_dele" data-id="' + ability.id + '"></a>' +
            '<div class="target_cont">' +
            '<span class="target_points">知识点数：' + ability.knowledgeCount + '</span>' +
            '<h3 class="target_title">' + ability.name + '</h3>' +
            tagsHtml +
            descHtml +
            '<p class="target_display" data-id="' + ability.id + '">显隐设置</p>' +
            '</div>';

        item.addEventListener('click', function (e) {
            if (e.target.closest('.target_dele') || e.target.closest('.target_display') || e.target.closest('.target_drag')) return;
            selectAbility(ability.id);
        });

        item.querySelector('.target_dele').addEventListener('click', function (e) {
            e.stopPropagation();
            showConfirm('该内容及其与知识点的关联关系将一并删除，确认删除？', function () {
                removeAbility(ability.id);
            });
        });

        item.querySelector('.target_display').addEventListener('click', function (e) {
            e.stopPropagation();
            showVisibilityModal(ability.id);
        });

        item.querySelector('.target_drag').addEventListener('mousedown', function (e) {
            e.preventDefault();
            e.stopPropagation();
            startDrag(e, item, ability.id);
        });

        return item;
    }

    function selectAbility(id) {
        selectedAbilityId = id;
        svgScale = 1;
        svgPanX = 0;
        svgPanY = 0;
        collapsedNodes.clear();
        document.querySelectorAll('.target-item').forEach(item => {
            item.classList.toggle('target_active', item.getAttribute('data-id') === id);
        });
        renderKnowledgeGraph();
    }

    function removeAbility(id) {
        abilities = abilities.filter(a => a.id !== id);
        if (selectedAbilityId === id) {
            selectedAbilityId = null;
        }
        saveData();
        renderAll();
    }

    function startDrag(e, item, id) {
        dragItem = item;
        dragStartY = e.clientY;

        function onMove(e) {
            const items = Array.from(targetGroup.children);
            const currentItem = items.find(i => i === dragItem);
            if (!currentItem) return;

            items.forEach(i => {
                if (i === dragItem) return;
                const r = i.getBoundingClientRect();
                const midY = r.top + r.height / 2;
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
            const newOrder = Array.from(targetGroup.children).map(i => i.getAttribute('data-id'));
            const reordered = [];
            newOrder.forEach(id => {
                const a = abilities.find(a => a.id === id);
                if (a) reordered.push(a);
            });
            const remaining = abilities.filter(a => !newOrder.includes(a.id));
            abilities = [...remaining, ...reordered];
            saveData();
            dragItem = null;
        }

        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
    }

    function renderKnowledgeGraph() {
        if (!selectedAbilityId) {
            knowledgeEmpty.style.display = 'flex';
            knowledgeSvg.style.display = 'none';
            return;
        }

        const ability = abilities.find(a => a.id === selectedAbilityId);
        if (!ability || !ability.knowledgeIds || ability.knowledgeIds.length === 0) {
            knowledgeEmpty.style.display = 'flex';
            knowledgeSvg.style.display = 'none';
            return;
        }

        knowledgeEmpty.style.display = 'none';
        knowledgeSvg.style.display = 'block';

        const tree = loadKnowledgeTree();
        graphNodes = [];
        graphLinks = [];

        const centerX = knowledgeCanvas.clientWidth / 2;

        graphNodes.push({
            id: 'ability-' + ability.id,
            name: ability.name,
            x: centerX,
            y: 60,
            type: 'root',
            hasChildren: true
        });

        const knowledgeNodes = findKnowledgeNodes(tree, ability.knowledgeIds);
        const spacing = Math.min(140, (knowledgeCanvas.clientWidth - 100) / Math.max(knowledgeNodes.length, 1));
        const startX = centerX - (knowledgeNodes.length - 1) * spacing / 2;

        knowledgeNodes.forEach((kn, i) => {
            const nodeId = 'kn-' + kn.id;
            const hasChildren = kn.children && kn.children.length > 0;
            graphNodes.push({
                id: nodeId,
                name: kn.name,
                x: startX + i * spacing,
                y: 200,
                type: 'knowledge',
                hasChildren: hasChildren,
                parentId: 'ability-' + ability.id
            });
            graphLinks.push({ source: 'ability-' + ability.id, target: nodeId });

            if (hasChildren) {
                const childSpacing = Math.min(100, spacing / Math.max(kn.children.length, 1));
                const childStartX = startX + i * spacing - (kn.children.length - 1) * childSpacing / 2;
                kn.children.forEach((child, j) => {
                    const childId = 'kn-' + child.id;
                    graphNodes.push({
                        id: childId,
                        name: child.name,
                        x: childStartX + j * childSpacing,
                        y: 340,
                        type: 'child',
                        hasChildren: false,
                        parentId: nodeId
                    });
                    graphLinks.push({ source: nodeId, target: childId });
                });
            }
        });

        drawSvgGraph();
    }

    function findKnowledgeNodes(tree, ids) {
        const result = [];
        function traverse(nodes) {
            if (!nodes) return;
            nodes.forEach(node => {
                if (ids.includes(node.id)) {
                    result.push(node);
                }
                if (node.children) traverse(node.children);
            });
        }
        traverse(tree);
        return result;
    }

    function getVisibleNodesAndLinks() {
        const hiddenIds = new Set();
        collapsedNodes.forEach(parentId => {
            graphLinks.forEach(link => {
                if (link.source === parentId) {
                    hiddenIds.add(link.target);
                    collectDescendants(link.target, hiddenIds);
                }
            });
        });

        const visibleNodes = graphNodes.filter(n => !hiddenIds.has(n.id));
        const visibleLinks = graphLinks.filter(l => !hiddenIds.has(l.source) && !hiddenIds.has(l.target));
        return { visibleNodes, visibleLinks, hiddenIds };
    }

    function collectDescendants(parentId, hiddenIds) {
        graphLinks.forEach(link => {
            if (link.source === parentId) {
                hiddenIds.add(link.target);
                collectDescendants(link.target, hiddenIds);
            }
        });
    }

    function drawSvgGraph() {
        knowledgeSvg.innerHTML = '';
        const svgNS = 'http://www.w3.org/2000/svg';

        const defs = document.createElementNS(svgNS, 'defs');
        const marker = document.createElementNS(svgNS, 'marker');
        marker.setAttribute('id', 'arrowhead');
        marker.setAttribute('markerWidth', '10');
        marker.setAttribute('markerHeight', '7');
        marker.setAttribute('refX', '10');
        marker.setAttribute('refY', '3.5');
        marker.setAttribute('orient', 'auto');
        const polygon = document.createElementNS(svgNS, 'polygon');
        polygon.setAttribute('points', '0 0, 10 3.5, 0 7');
        polygon.setAttribute('fill', '#c0c4cc');
        marker.appendChild(polygon);
        defs.appendChild(marker);
        knowledgeSvg.appendChild(defs);

        const mainGroup = document.createElementNS(svgNS, 'g');
        mainGroup.setAttribute('id', 'svg-main-group');
        mainGroup.setAttribute('transform', 'translate(' + svgPanX + ',' + svgPanY + ') scale(' + svgScale + ')');
        knowledgeSvg.appendChild(mainGroup);

        const { visibleNodes, visibleLinks, hiddenIds } = getVisibleNodesAndLinks();

        const linksGroup = document.createElementNS(svgNS, 'g');
        linksGroup.setAttribute('class', 'svg-links-group');
        mainGroup.appendChild(linksGroup);

        visibleLinks.forEach(link => {
            const source = graphNodes.find(n => n.id === link.source);
            const target = graphNodes.find(n => n.id === link.target);
            if (!source || !target) return;

            const sourceR = source.type === 'root' ? 28 : 22;
            const targetR = target.type === 'child' ? 18 : 22;

            const line = document.createElementNS(svgNS, 'path');
            const sx = source.x;
            const sy = source.y + sourceR;
            const tx = target.x;
            const ty = target.y - targetR;
            const midY = (sy + ty) / 2;
            const d = 'M' + sx + ',' + sy + ' C' + sx + ',' + midY + ' ' + tx + ',' + midY + ' ' + tx + ',' + ty;
            line.setAttribute('d', d);
            line.setAttribute('stroke', '#c0c4cc');
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('fill', 'none');
            line.setAttribute('marker-end', 'url(#arrowhead)');
            line.setAttribute('data-source', link.source);
            line.setAttribute('data-target', link.target);
            linksGroup.appendChild(line);
        });

        const nodesGroup = document.createElementNS(svgNS, 'g');
        nodesGroup.setAttribute('class', 'svg-nodes-group');
        mainGroup.appendChild(nodesGroup);

        visibleNodes.forEach(node => {
            const g = document.createElementNS(svgNS, 'g');
            g.setAttribute('class', 'svg-node');
            g.setAttribute('data-id', node.id);
            g.setAttribute('transform', 'translate(' + node.x + ',' + node.y + ')');
            g.style.cursor = 'grab';

            const r = node.type === 'root' ? 28 : node.type === 'knowledge' ? 22 : 18;
            const fillColor = node.type === 'root' ? '#3a8bff' : node.type === 'knowledge' ? '#67c23a' : '#e6a23c';

            const shadow = document.createElementNS(svgNS, 'circle');
            shadow.setAttribute('cx', '2');
            shadow.setAttribute('cy', '3');
            shadow.setAttribute('r', r);
            shadow.setAttribute('fill', 'rgba(0,0,0,0.08)');
            g.appendChild(shadow);

            const circle = document.createElementNS(svgNS, 'circle');
            circle.setAttribute('cx', '0');
            circle.setAttribute('cy', '0');
            circle.setAttribute('r', r);
            circle.setAttribute('fill', fillColor);
            circle.setAttribute('stroke', '#fff');
            circle.setAttribute('stroke-width', '2');
            g.appendChild(circle);

            const iconText = document.createElementNS(svgNS, 'text');
            iconText.setAttribute('x', '0');
            iconText.setAttribute('y', '1');
            iconText.setAttribute('text-anchor', 'middle');
            iconText.setAttribute('dominant-baseline', 'middle');
            iconText.setAttribute('font-size', node.type === 'root' ? '16' : '12');
            iconText.setAttribute('fill', '#fff');
            iconText.setAttribute('font-weight', '600');
            if (node.type === 'root') {
                iconText.textContent = '\u26A1';
            } else if (node.type === 'knowledge') {
                iconText.textContent = '\u2605';
            } else {
                iconText.textContent = '\u25CF';
            }
            g.appendChild(iconText);

            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', '0');
            text.setAttribute('y', r + 16);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '12');
            text.setAttribute('fill', '#181e33');
            text.setAttribute('font-weight', '500');
            text.textContent = node.name;
            g.appendChild(text);

            if (node.hasChildren) {
                const isCollapsed = collapsedNodes.has(node.id);
                const toggleY = r + 4;

                const toggleBg = document.createElementNS(svgNS, 'circle');
                toggleBg.setAttribute('cx', '0');
                toggleBg.setAttribute('cy', String(toggleY));
                toggleBg.setAttribute('r', '10');
                toggleBg.setAttribute('fill', '#fff');
                toggleBg.setAttribute('stroke', fillColor);
                toggleBg.setAttribute('stroke-width', '1.5');
                toggleBg.setAttribute('class', 'toggle-btn');
                toggleBg.setAttribute('data-node-id', node.id);
                toggleBg.style.cursor = 'pointer';
                g.appendChild(toggleBg);

                const toggleText = document.createElementNS(svgNS, 'text');
                toggleText.setAttribute('x', '0');
                toggleText.setAttribute('cy', String(toggleY));
                toggleText.setAttribute('y', String(toggleY + 1));
                toggleText.setAttribute('text-anchor', 'middle');
                toggleText.setAttribute('dominant-baseline', 'middle');
                toggleText.setAttribute('font-size', '14');
                toggleText.setAttribute('font-weight', '700');
                toggleText.setAttribute('fill', fillColor);
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
                const startX = e.clientX;
                const startY = e.clientY;
                dragNodeId = node.id;
                dragNodeStartX = node.x;
                dragNodeStartY = node.y;

                longPressTimer = setTimeout(function () {
                    isLongPress = true;
                    isDraggingNode = true;
                    g.style.cursor = 'grabbing';
                }, 200);

                function onNodeMove(e) {
                    const dx = e.clientX - startX;
                    const dy = e.clientY - startY;
                    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
                        clearTimeout(longPressTimer);
                        if (!isDraggingNode) {
                            isDraggingNode = true;
                            g.style.cursor = 'grabbing';
                        }
                    }
                    if (isDraggingNode) {
                        const n = graphNodes.find(n => n.id === dragNodeId);
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

        knowledgeSvg.querySelectorAll('.toggle-btn').forEach(btn => {
            btn.addEventListener('mousedown', function (e) {
                e.stopPropagation();
            });
            btn.addEventListener('click', function (e) {
                e.stopPropagation();
                const nodeId = this.getAttribute('data-node-id');
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

    function updateLinks() {
        const { visibleNodes, visibleLinks } = getVisibleNodesAndLinks();
        const linksGroup = knowledgeSvg.querySelector('.svg-links-group');
        if (!linksGroup) return;

        const svgNS = 'http://www.w3.org/2000/svg';
        linksGroup.innerHTML = '';

        visibleLinks.forEach(link => {
            const source = graphNodes.find(n => n.id === link.source);
            const target = graphNodes.find(n => n.id === link.target);
            if (!source || !target) return;

            const sourceR = source.type === 'root' ? 28 : 22;
            const targetR = target.type === 'child' ? 18 : 22;

            const line = document.createElementNS(svgNS, 'path');
            const sx = source.x;
            const sy = source.y + sourceR;
            const tx = target.x;
            const ty = target.y - targetR;
            const midY = (sy + ty) / 2;
            const d = 'M' + sx + ',' + sy + ' C' + sx + ',' + midY + ' ' + tx + ',' + midY + ' ' + tx + ',' + ty;
            line.setAttribute('d', d);
            line.setAttribute('stroke', '#c0c4cc');
            line.setAttribute('stroke-width', '1.5');
            line.setAttribute('fill', 'none');
            line.setAttribute('marker-end', 'url(#arrowhead)');
            linksGroup.appendChild(line);
        });
    }

    function initSvgPanZoom() {
        knowledgeSvg.onwheel = function (e) {
            e.preventDefault();
            const delta = e.deltaY > 0 ? -0.1 : 0.1;
            const newScale = Math.max(0.2, Math.min(3, svgScale + delta));

            const rect = knowledgeSvg.getBoundingClientRect();
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;

            const scaleRatio = newScale / svgScale;
            svgPanX = mouseX - scaleRatio * (mouseX - svgPanX);
            svgPanY = mouseY - scaleRatio * (mouseY - svgPanY);
            svgScale = newScale;

            const mainGroup = knowledgeSvg.querySelector('#svg-main-group');
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
            const mainGroup = knowledgeSvg.querySelector('#svg-main-group');
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

    function updateZoomDisplay() {
        let display = knowledgeSvg.querySelector('.zoom-display');
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

    function showVisibilityModal(abilityId) {
        currentEditingAbilityId = abilityId;
        const ability = abilities.find(a => a.id === abilityId);
        if (!ability) return;

        visibilityAbilityName.textContent = '能力名称：' + ability.name;
        const classes = loadClasses();
        visibilityCheckboxes.innerHTML = '';

        const allLabel = document.createElement('label');
        allLabel.className = 'checkbox-item checkbox-all';
        allLabel.innerHTML =
            '<input type="checkbox" id="visibility-all-classes"' + (ability.classes.includes('all') ? ' checked' : '') + '>' +
            '<span class="checkbox-custom"></span>' +
            '<span class="checkbox-text">全部班级</span>';
        visibilityCheckboxes.appendChild(allLabel);

        const allInput = allLabel.querySelector('input');
        allInput.addEventListener('change', function () {
            const checkboxes = visibilityCheckboxes.querySelectorAll('.checkbox-item:not(.checkbox-all) input');
            checkboxes.forEach(cb => { cb.checked = allInput.checked; cb.disabled = allInput.checked; });
        });

        classes.forEach(cls => {
            const label = document.createElement('label');
            label.className = 'checkbox-item';
            const isChecked = ability.classes.includes('all') || ability.classes.includes(cls);
            label.innerHTML =
                '<input type="checkbox" data-class="' + cls + '"' + (isChecked ? ' checked' : '') + (ability.classes.includes('all') ? ' disabled' : '') + '>' +
                '<span class="checkbox-custom"></span>' +
                '<span class="checkbox-text">' + cls + '</span>';
            visibilityCheckboxes.appendChild(label);
        });

        visibilityModal.classList.add('show');
    }

    visibilityClose.addEventListener('click', function () { visibilityModal.classList.remove('show'); });
    visibilityCancel.addEventListener('click', function () { visibilityModal.classList.remove('show'); });
    visibilityConfirm.addEventListener('click', function () {
        const ability = abilities.find(a => a.id === currentEditingAbilityId);
        if (!ability) return;

        const allCb = visibilityCheckboxes.querySelector('#visibility-all-classes');
        if (allCb.checked) {
            ability.classes = ['all'];
        } else {
            ability.classes = [];
            visibilityCheckboxes.querySelectorAll('.checkbox-item:not(.checkbox-all) input:checked').forEach(cb => {
                ability.classes.push(cb.getAttribute('data-class'));
            });
        }
        saveData();
        visibilityModal.classList.remove('show');
    });

    function showKnowledgeModal(selectedIds) {
        tempSelectedKnowledge = selectedIds ? [...selectedIds] : [];
        const tree = loadKnowledgeTree();
        renderKnowledgeTree(tree);
        updateKnowledgeSelectedList();
        knowledgeModal.classList.add('show');
    }

    function renderKnowledgeTree(tree) {
        knowledgeTreeContainer.innerHTML = '';
        let totalCount = 0;
        function countNodes(nodes) {
            nodes.forEach(n => {
                totalCount++;
                if (n.children) countNodes(n.children);
            });
        }
        countNodes(tree);
        knowledgeTreeCount.textContent = totalCount;

        tree.forEach(node => {
            knowledgeTreeContainer.appendChild(createTreeNode(node, 0));
        });
    }

    function createTreeNode(node, level) {
        const li = document.createElement('li');
        const hasChildren = node.children && node.children.length > 0;

        const main = document.createElement('div');
        main.className = 'tree_main';
        main.style.paddingLeft = (14 + level * 20) + 'px';

        if (hasChildren) {
            const arrow = document.createElement('span');
            arrow.className = 'tree_arrow';
            arrow.innerHTML = '<i class="fas fa-chevron-right"></i>';
            arrow.addEventListener('click', function (e) {
                e.stopPropagation();
                arrow.classList.toggle('expanded');
                const children = li.querySelector('.tree_children');
                if (children) children.classList.toggle('expanded');
            });
            main.appendChild(arrow);
        } else {
            const spacer = document.createElement('span');
            spacer.style.width = '20px';
            spacer.style.display = 'inline-block';
            spacer.style.flexShrink = '0';
            main.appendChild(spacer);
        }

        const text = document.createElement('span');
        text.className = 'tree_text';
        text.textContent = node.name;
        text.addEventListener('click', function () {
            if (hasChildren) {
                const arrow = main.querySelector('.tree_arrow');
                if (arrow) {
                    arrow.classList.toggle('expanded');
                    const children = li.querySelector('.tree_children');
                    if (children) children.classList.toggle('expanded');
                }
            }
        });
        main.appendChild(text);

        const check = document.createElement('span');
        check.className = 'tree_check' + (tempSelectedKnowledge.includes(node.id) ? ' checked' : '');
        check.addEventListener('click', function (e) {
            e.stopPropagation();
            toggleKnowledgeSelection(node.id);
            check.classList.toggle('checked');
        });
        main.appendChild(check);

        li.appendChild(main);

        if (hasChildren) {
            const childrenUl = document.createElement('ul');
            childrenUl.className = 'tree_children';
            node.children.forEach(child => {
                childrenUl.appendChild(createTreeNode(child, level + 1));
            });
            li.appendChild(childrenUl);

            if (tempSelectedKnowledge.some(id => node.children.some(c => c.id === id))) {
                const arrow = main.querySelector('.tree_arrow');
                if (arrow) arrow.classList.add('expanded');
                childrenUl.classList.add('expanded');
            }
        }

        return li;
    }

    function toggleKnowledgeSelection(id) {
        const idx = tempSelectedKnowledge.indexOf(id);
        if (idx >= 0) {
            tempSelectedKnowledge.splice(idx, 1);
        } else {
            tempSelectedKnowledge.push(id);
        }
        updateKnowledgeSelectedList();
    }

    function updateKnowledgeSelectedList() {
        knowledgeSelectedCount.textContent = tempSelectedKnowledge.length;
        knowledgeSelectedList.innerHTML = '';

        const tree = loadKnowledgeTree();
        tempSelectedKnowledge.forEach(id => {
            const name = findKnowledgeName(tree, id);
            if (!name) return;
            const li = document.createElement('li');
            li.innerHTML = '<span class="zpSpan">' + name + '</span><span class="zpPele" data-id="' + id + '"></span>';
            li.querySelector('.zpPele').addEventListener('click', function () {
                toggleKnowledgeSelection(id);
                renderKnowledgeTree(tree);
                updateKnowledgeSelectedList();
            });
            knowledgeSelectedList.appendChild(li);
        });
    }

    function findKnowledgeName(tree, id) {
        for (const node of tree) {
            if (node.id === id) return node.name;
            if (node.children) {
                const result = findKnowledgeName(node.children, id);
                if (result) return result;
            }
        }
        return null;
    }

    knowledgeModalClose.addEventListener('click', function () { knowledgeModal.classList.remove('show'); });
    knowledgeCancel.addEventListener('click', function () { knowledgeModal.classList.remove('show'); });
    knowledgeConfirm.addEventListener('click', function () {
        if (currentEditingAbilityId) {
            const ability = abilities.find(a => a.id === currentEditingAbilityId);
            if (ability) {
                ability.knowledgeIds = [...tempSelectedKnowledge];
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
        const ability = abilities.find(a => a.id === selectedAbilityId);
        showKnowledgeModal(ability ? ability.knowledgeIds : []);
    });

    function showConfirm(text, callback) {
        confirmText.textContent = text;
        confirmCallback = callback;
        confirmModal.classList.add('show');
    }

    confirmClose.addEventListener('click', function () { confirmModal.classList.remove('show'); confirmCallback = null; });
    confirmCancel.addEventListener('click', function () { confirmModal.classList.remove('show'); confirmCallback = null; });
    confirmConfirm.addEventListener('click', function () {
        confirmModal.classList.remove('show');
        if (confirmCallback) confirmCallback();
        confirmCallback = null;
    });

    targetAddBtn.addEventListener('click', function () {
        window.location.href = 'targetManagement.html';
    });

    function renderAll() {
        updateChart();
        renderAbilities();
        renderKnowledgeGraph();
    }

    function init() {
        loadData();
        initClassSelector();
        initChart();
        renderAll();
    }

    init();
})();
