/**
 * targetManagement.js - 目标管理页面核心脚本
 *
 * 功能概述：
 *   1. 能力条目的 CRUD 管理（创建、编辑、删除、批量删除）
 *   2. 数据导入导出（JSON 格式）
 *   3. 表格筛选（按名称搜索、按标签过滤）
 *
 * 模块结构：
 *   一、常量与状态：存储键、数据状态、DOM引用、颜色池
 *   二、工具函数：数据筛选、UI状态更新
 *   三、数据持久化：加载与保存
 *   四、表格渲染：能力管理表格
 *   五、删除能力
 *   六、标签筛选器
 *   七、数据导入导出
 *   八、事件绑定：集中注册所有事件监听
 *   九、初始化入口
 *
 * 数据存储键：
 *   - abilityMapData：能力条目数据
 *   - targetTags：标签列表
 *   - knowledgeTreeData：知识点树形数据
 *
 * 依赖：
 *   - common.js（StorageManager）
 *   - abilityEdit.js（AbilityEdit 编辑弹窗模块）
 *   - Font Awesome（图标库）
 */

(function () {
    'use strict';

    /* ============================================================
     * 一、常量与状态
     * ============================================================ */

    var ABILITIES_KEY = 'abilityMapData';
    var TAGS_KEY = 'targetTags';
    var KNOWLEDGE_KEY = 'knowledgeTreeData';

    var abilities = [];
    var tags = [];
    var knowledgeTree = [];
    var selectedIds = new Set();
    var filterTag = '';
    var filterName = '';

    var tableBody = document.getElementById('table-body');
    var batchBar = document.getElementById('batch-bar');
    var checkAll = document.getElementById('check-all');
    var backBtn = document.getElementById('back-btn');
    var createBtn = document.getElementById('create-btn');
    var templateImportBtn = document.getElementById('template-import-btn');
    var exportBtn = document.getElementById('export-btn');
    var nameFilter = document.getElementById('name-filter');
    var tagFilter = document.getElementById('tag-filter');
    var tagFilterDropdown = document.getElementById('tag-filter-dropdown');
    var batchDeleteBtn = document.getElementById('batch-delete-btn');

    var tagColors = ['#F77763', '#67c23a', '#5AC482', '#409eff', '#e6a23c'];

    var abilityEditor = null;

    /* ============================================================
     * 二、工具函数
     * ============================================================ */

    function getFilteredAbilities() {
        return abilities.filter(function (a) {
            var match = true;
            if (filterTag && a.tags && !a.tags.includes(filterTag)) {
                match = false;
            }
            if (filterName && !(a.name || '').toLowerCase().includes(filterName.toLowerCase())) {
                match = false;
            }
            return match;
        });
    }

    function updateCheckAll() {
        var filtered = getFilteredAbilities();
        checkAll.checked = filtered.length > 0 && filtered.every(function (a) {
            return selectedIds.has(a.id);
        });
    }

    function updateBatchBar() {
        if (selectedIds.size > 0) {
            batchBar.classList.add('show');
        } else {
            batchBar.classList.remove('show');
        }
    }

    /* ============================================================
     * 三、数据持久化
     * ============================================================ */

    function loadData() {
        var abilitiesData = StorageManager.get(ABILITIES_KEY, null);
        abilities = abilitiesData || [];

        var tagsData = StorageManager.get(TAGS_KEY, null);
        tags = tagsData || ['标签1', '标签2', '标签3'];

        var knowledgeData = StorageManager.get(KNOWLEDGE_KEY, null);
        knowledgeTree = knowledgeData || [
            { id: 'k1', name: '身体协调', children: [{ id: 'k1-1', name: '上肢协调' }, { id: 'k1-2', name: '下肢协调' }] },
            { id: 'k2', name: '运动技能', children: [{ id: 'k2-1', name: '跑步技能' }, { id: 'k2-2', name: '跳跃技能' }, { id: 'k2-3', name: '投掷技能' }] },
            { id: 'k3', name: '理论知识', children: [{ id: 'k3-1', name: '运动生理' }, { id: 'k3-2', name: '运动心理' }] },
            { id: 'k4', name: '战术意识', children: [{ id: 'k4-1', name: '进攻战术' }, { id: 'k4-2', name: '防守战术' }] }
        ];
    }

    function saveAbilities() {
        StorageManager.set(ABILITIES_KEY, abilities);
    }

    function saveTags() {
        StorageManager.set(TAGS_KEY, tags);
    }

    /* ============================================================
     * 四、表格渲染
     * ============================================================ */

    function renderTable() {
        var filtered = getFilteredAbilities();
        tableBody.innerHTML = '';

        filtered.forEach(function (ability, index) {
            var tr = document.createElement('tr');
            tr.setAttribute('data-id', ability.id);

            var tdCheck = document.createElement('td');
            tdCheck.className = 'th-check';
            tdCheck.innerHTML = '<input type="checkbox" class="row-check" data-id="' + ability.id + '"' + (selectedIds.has(ability.id) ? ' checked' : '') + '>';
            tdCheck.querySelector('.row-check').addEventListener('change', function () {
                if (this.checked) {
                    selectedIds.add(ability.id);
                } else {
                    selectedIds.delete(ability.id);
                }
                updateBatchBar();
                updateCheckAll();
            });
            tr.appendChild(tdCheck);

            var tdIndex = document.createElement('td');
            tdIndex.className = 'th-index';
            tdIndex.textContent = (index + 1);
            tr.appendChild(tdIndex);

            var tdName = document.createElement('td');
            tdName.className = 'th-name';
            tdName.textContent = ability.name || '';
            tr.appendChild(tdName);

            var tdTags = document.createElement('td');
            tdTags.className = 'th-tags';
            (ability.tags || []).forEach(function (tag) {
                var tagSpan = document.createElement('span');
                tagSpan.className = 'table-tag';
                var color = tagColors[index % tagColors.length];
                tagSpan.style.borderColor = color;
                tagSpan.style.color = color;
                tagSpan.textContent = tag;
                tdTags.appendChild(tagSpan);
            });
            tr.appendChild(tdTags);

            var tdDesc = document.createElement('td');
            tdDesc.className = 'th-desc';
            var descSpan = document.createElement('span');
            descSpan.className = 'table-desc';
            descSpan.textContent = ability.desc || '';
            tdDesc.appendChild(descSpan);
            tr.appendChild(tdDesc);

            var tdAction = document.createElement('td');
            tdAction.className = 'th-action';

            var editBtn = document.createElement('button');
            editBtn.className = 'action-btn-td';
            editBtn.textContent = '编辑';
            editBtn.addEventListener('click', function () {
                abilityEditor.open(ability.id);
            });
            tdAction.appendChild(editBtn);

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn-td delete-btn';
            deleteBtn.textContent = '删除';
            deleteBtn.addEventListener('click', function () {
                abilityEditor.confirm('确定是否删除？', function () {
                    deleteAbility(ability.id);
                });
            });
            tdAction.appendChild(deleteBtn);

            tr.appendChild(tdAction);
            tableBody.appendChild(tr);
        });
    }

    /* ============================================================
     * 五、删除能力
     * ============================================================ */

    function deleteAbility(id) {
        abilities = abilities.filter(function (a) { return a.id !== id; });
        selectedIds.delete(id);
        saveAbilities();
        renderTable();
        updateBatchBar();
    }

    /* ============================================================
     * 六、标签筛选器
     * ============================================================ */

    function initTagFilter() {
        var allItem = document.createElement('div');
        allItem.className = 'filter-dropdown-item active';
        allItem.textContent = '全部';
        allItem.addEventListener('click', function () {
            filterTag = '';
            tagFilter.querySelector('.filter-text').textContent = '全部';
            tagFilterDropdown.querySelectorAll('.filter-dropdown-item').forEach(function (el) { el.classList.remove('active'); });
            this.classList.add('active');
            tagFilter.classList.remove('open');
            renderTable();
        });
        tagFilterDropdown.appendChild(allItem);

        tags.forEach(function (tag) {
            var item = document.createElement('div');
            item.className = 'filter-dropdown-item';
            item.textContent = tag;
            item.addEventListener('click', function () {
                filterTag = tag;
                tagFilter.querySelector('.filter-text').textContent = tag;
                tagFilterDropdown.querySelectorAll('.filter-dropdown-item').forEach(function (el) { el.classList.remove('active'); });
                this.classList.add('active');
                tagFilter.classList.remove('open');
                renderTable();
            });
            tagFilterDropdown.appendChild(item);
        });
    }

    /* ============================================================
     * 七、数据导入导出
     * ============================================================ */

    function exportData() {
        var jsonStr = JSON.stringify(abilities, null, 2);
        var blob = new Blob([jsonStr], { type: 'application/json' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'contents_' + Date.now() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function triggerImport() {
        document.getElementById('template-file-input').click();
    }

    function handleFileImport(e) {
        var file = e.target.files[0];
        if (!file) return;
        var reader = new FileReader();
        reader.onload = function (ev) {
            try {
                var data = JSON.parse(ev.target.result);
                if (Array.isArray(data)) {
                    abilities = data;
                    saveAbilities();
                    renderTable();
                    alert('导入成功');
                } else {
                    alert('无效的文件格式');
                }
            } catch (err) {
                alert('导入失败: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    /* ============================================================
     * 八、事件绑定
     * ============================================================ */

    function bindEvents() {
        checkAll.addEventListener('change', function () {
            var filtered = getFilteredAbilities();
            if (checkAll.checked) {
                filtered.forEach(function (a) { selectedIds.add(a.id); });
            } else {
                filtered.forEach(function (a) { selectedIds.delete(a.id); });
            }
            renderTable();
            updateBatchBar();
        });

        batchDeleteBtn.addEventListener('click', function () {
            if (selectedIds.size === 0) return;
            abilityEditor.confirm('确定是否删除选中的内容？', function () {
                abilities = abilities.filter(function (a) { return !selectedIds.has(a.id); });
                selectedIds.clear();
                saveAbilities();
                renderTable();
                updateBatchBar();
            });
        });

        backBtn.addEventListener('click', function () {
            window.location.href = 'targetMapTeacher.html';
        });

        createBtn.addEventListener('click', function () {
            abilityEditor.create();
        });

        tagFilter.addEventListener('click', function (e) {
            e.stopPropagation();
            tagFilter.classList.toggle('open');
        });
        document.addEventListener('click', function () {
            tagFilter.classList.remove('open');
        });

        nameFilter.addEventListener('input', function () {
            filterName = this.value;
            renderTable();
        });

        exportBtn.addEventListener('click', exportData);

        templateImportBtn.addEventListener('click', triggerImport);
        document.getElementById('template-file-input').addEventListener('change', handleFileImport);
    }

    /* ============================================================
     * 九、初始化入口
     * ============================================================ */

    async function init() {
        loadData();
        initTagFilter();
        bindEvents();
        renderTable();

        abilityEditor = await new AbilityEdit({
            getAbilities: function () { return abilities; },
            saveAbilities: saveAbilities,
            getTags: function () { return tags; },
            saveTags: saveTags,
            getKnowledgeTree: function () { return knowledgeTree; },
            onSaved: function () { renderTable(); },
            tagColors: tagColors
        });
    }

    init();

})();
