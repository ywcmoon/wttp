/**
 * targetManagement.js - 目标管理页面核心脚本
 * 
 * 功能说明：
 *   1. 能力条目的 CRUD 管理（创建、编辑、删除、批量删除）
 *   2. 标签管理（添加、编辑、删除标签，支持搜索过滤）
 *   3. 知识点树形选择（多级树结构，勾选/取消）
 *   4. 数据导入导出（JSON 格式）
 *   5. 表格筛选（按名称搜索、按标签过滤）
 * 
 * 数据存储键：
 *   - abilityMapData：能力条目数据
 *   - targetTags：标签列表
 *   - knowledgeTreeData：知识点树形数据
 * 
 * 依赖：
 *   - common.js（StorageManager）
 *   - Font Awesome（图标）
 */
(function () {
    'use strict';

    // ==================== 存储键常量 ====================

    /** @type {string} 能力数据在 localStorage 中的键名 */
    var ABILITIES_KEY = 'abilityMapData';

    /** @type {string} 标签数据在 localStorage 中的键名 */
    var TAGS_KEY = 'targetTags';

    /** @type {string} 知识点树数据在 localStorage 中的键名 */
    var KNOWLEDGE_KEY = 'knowledgeTreeData';

    // ==================== 核心数据状态 ====================

    /** @type {Array} 能力条目列表 */
    var abilities = [];

    /** @type {Array<string>} 标签名称列表 */
    var tags = [];

    /** @type {Array} 知识点树形数据 */
    var knowledgeTree = [];

    /** @type {Set<string>} 表格中已勾选的能力 ID 集合（批量操作） */
    var selectedIds = new Set();

    /** @type {string|null} 当前正在编辑的能力 ID，null 表示新建 */
    var currentEditId = null;

    /** @type {Array<string>} 编辑表单中的临时标签列表 */
    var tempFormTags = [];

    /** @type {Array<string>} 编辑表单中的临时知识点 ID 列表 */
    var tempFormKnowledge = [];

    /** @type {Array<string>} 标签选择弹窗中的临时选中标签 */
    var tempTagSelected = [];

    /** @type {Array<string>} 知识点选择弹窗中的临时选中知识点 ID */
    var tempKnowledgeSelected = [];

    /** @type {Function|null} 确认弹窗的回调函数 */
    var confirmCallback = null;

    /** @type {string} 当前标签筛选项（空字符串表示全部） */
    var filterTag = '';

    /** @type {string} 当前名称搜索关键词 */
    var filterName = '';

    // ==================== DOM 元素引用 ====================

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

    var createModal = document.getElementById('create-modal-overlay');
    var createModalTitle = document.getElementById('create-modal-title');
    var createModalClose = document.getElementById('create-modal-close');
    var createBtnCancel = document.getElementById('create-btn-cancel');
    var createBtnConfirm = document.getElementById('create-btn-confirm');
    var formName = document.getElementById('form-name');
    var formDesc = document.getElementById('form-desc');
    var formTags = document.getElementById('form-tags');
    var formTagCount = document.getElementById('form-tag-count');
    var formKnowledgeTags = document.getElementById('form-knowledge-tags');
    var formKnowledgeCount = document.getElementById('form-knowledge-count');
    var addTagBtn = document.getElementById('add-tag-btn');
    var addKnowledgeBtn = document.getElementById('add-knowledge-btn');

    var tagModal = document.getElementById('tag-modal-overlay');
    var tagModalClose = document.getElementById('tag-modal-close');
    var tagBtnCancel = document.getElementById('tag-btn-cancel');
    var tagBtnConfirm = document.getElementById('tag-btn-confirm');
    var newTagBtn = document.getElementById('new-tag-btn');
    var newTagForm = document.getElementById('tag-new-form');
    var newTagName = document.getElementById('new-tag-name');
    var newTagConfirm = document.getElementById('new-tag-confirm');
    var newTagCancel = document.getElementById('new-tag-cancel');
    var tagSearchInput = document.getElementById('tag-search-input');
    var tagList = document.getElementById('tag-list');
    var tagSelectedCount = document.getElementById('tag-selected-count');
    var tagSelectedList = document.getElementById('tag-selected-list');

    var knowledgeModal = document.getElementById('knowledge-modal-overlay');
    var knowledgeModalClose = document.getElementById('knowledge-modal-close');
    var knowledgeBtnCancel = document.getElementById('knowledge-btn-cancel');
    var knowledgeBtnConfirm = document.getElementById('knowledge-btn-confirm');
    var knowledgeTreeContainer = document.getElementById('knowledge-tree');
    var knowledgeTreeCount = document.getElementById('knowledge-tree-count');
    var knowledgeSelectedCount = document.getElementById('knowledge-selected-count');
    var knowledgeSelectedList = document.getElementById('knowledge-selected-list');

    var confirmModal = document.getElementById('confirm-modal-overlay');
    var confirmText = document.getElementById('confirm-text');
    var confirmModalClose = document.getElementById('confirm-modal-close');
    var confirmBtnCancel = document.getElementById('confirm-btn-cancel');
    var confirmBtnConfirm = document.getElementById('confirm-btn-confirm');

    /** @type {Array<string>} 标签颜色池，用于循环分配颜色 */
    var tagColors = ['#F77763', '#67c23a', '#5AC482', '#409eff', '#e6a23c'];

    // ==================== 数据加载与持久化 ====================

    /**
     * 从 localStorage 加载所有数据
     * 
     * 加载内容：
     *   - abilities：能力条目列表（abilityMapData）
     *   - tags：标签列表（targetTags），默认提供 3 个示例标签
     *   - knowledgeTree：知识点树（knowledgeTreeData），默认提供 4 个示例知识点
     */
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

    /**
     * 保存能力数据到 localStorage
     */
    function saveAbilities() {
        StorageManager.set(ABILITIES_KEY, abilities);
    }

    /**
     * 保存标签数据到 localStorage
     */
    function saveTags() {
        StorageManager.set(TAGS_KEY, tags);
    }

    // ==================== 数据筛选 ====================

    /**
     * 根据当前筛选条件过滤能力列表
     * 
     * 筛选条件：
     *   - filterTag：按标签筛选（空字符串表示不过滤）
     *   - filterName：按名称模糊搜索（不区分大小写）
     * 
     * @returns {Array} 过滤后的能力条目数组
     */
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

    // ==================== 表格渲染 ====================

    /**
     * 渲染能力管理表格
     * 
     * 表格列：
     *   - 复选框（批量选择）
     *   - 序号
     *   - 名称
     *   - 标签（彩色标签展示）
     *   - 描述
     *   - 操作（编辑 / 删除按钮）
     * 
     * 每行数据绑定选中状态，支持全选/取消全选联动
     */
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
                openCreateModal(ability.id);
            });
            tdAction.appendChild(editBtn);

            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'action-btn-td delete-btn';
            deleteBtn.textContent = '删除';
            deleteBtn.addEventListener('click', function () {
                showConfirm('确定是否删除？', function () {
                    deleteAbility(ability.id);
                });
            });
            tdAction.appendChild(deleteBtn);

            tr.appendChild(tdAction);
            tableBody.appendChild(tr);
        });
    }

    /**
     * 更新全选复选框状态
     * 当所有筛选后的条目都被选中时，全选框为勾选状态
     */
    function updateCheckAll() {
        var filtered = getFilteredAbilities();
        checkAll.checked = filtered.length > 0 && filtered.every(function (a) {
            return selectedIds.has(a.id);
        });
    }

    /**
     * 更新批量操作栏的显示/隐藏
     * 有选中项时显示批量操作栏，否则隐藏
     */
    function updateBatchBar() {
        if (selectedIds.size > 0) {
            batchBar.classList.add('show');
        } else {
            batchBar.classList.remove('show');
        }
    }

    // ==================== 全选与批量删除 ====================

    /**
     * 全选复选框变化事件
     * 勾选时选中所有筛选后的条目，取消时清空选中
     */
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

    /**
     * 批量删除按钮点击事件
     * 弹出确认框后删除所有选中的能力条目
     */
    batchDeleteBtn.addEventListener('click', function () {
        if (selectedIds.size === 0) return;
        showConfirm('确定是否删除选中的内容？', function () {
            abilities = abilities.filter(function (a) { return !selectedIds.has(a.id); });
            selectedIds.clear();
            saveAbilities();
            renderTable();
            updateBatchBar();
        });
    });

    // ==================== 导航按钮 ====================

    /**
     * 返回按钮 - 跳转到能力图谱教师视图
     */
    backBtn.addEventListener('click', function () {
        window.location.href = 'targetMapTeacher.html';
    });

    // ==================== 创建/编辑弹窗 ====================

    /**
     * 打开创建/编辑弹窗
     * 
     * @param {string|null} id - 能力 ID，为 null 时表示新建模式
     * 
     * 新建模式：
     *   - 弹窗标题为"新建"
     *   - 表单字段清空
     * 
     * 编辑模式：
     *   - 弹窗标题为"编辑"
     *   - 回填已有数据到表单
     */
    function openCreateModal(id) {
        currentEditId = id;
        createModalTitle.textContent = id ? '编辑' : '新建';

        if (id) {
            var ability = abilities.find(function (a) { return a.id === id; });
            if (ability) {
                formName.value = ability.name || '';
                formDesc.value = ability.desc || '';
                tempFormTags = ability.tags ? ability.tags.slice() : [];
                tempFormKnowledge = ability.knowledgeIds ? ability.knowledgeIds.slice() : [];
            }
        } else {
            formName.value = '';
            formDesc.value = '';
            tempFormTags = [];
            tempFormKnowledge = [];
        }

        renderFormTags();
        renderFormKnowledge();
        createModal.classList.add('show');
    }

    createBtn.addEventListener('click', function () { openCreateModal(null); });
    createModalClose.addEventListener('click', function () { createModal.classList.remove('show'); });
    createBtnCancel.addEventListener('click', function () { createModal.classList.remove('show'); });

    /**
     * 确认创建/编辑按钮事件
     * 
     * 校验：
     *   - 名称不能为空
     * 
     * 编辑模式：更新已有条目的字段
     * 新建模式：创建新条目，自动生成 ID 和随机背景色
     */
    createBtnConfirm.addEventListener('click', function () {
        var name = formName.value.trim();
        if (!name) {
            alert('请输入名称');
            formName.focus();
            return;
        }

        var desc = formDesc.value.trim();

        if (currentEditId) {
            var ability = abilities.find(function (a) { return a.id === currentEditId; });
            if (ability) {
                ability.name = name;
                ability.desc = desc;
                ability.tags = tempFormTags.slice();
                ability.knowledgeIds = tempFormKnowledge.slice();
                ability.knowledgeCount = tempFormKnowledge.length;
            }
        } else {
            var newAbility = {
                id: 'ability_' + Date.now(),
                name: name,
                desc: desc,
                tags: tempFormTags.slice(),
                knowledgeIds: tempFormKnowledge.slice(),
                knowledgeCount: tempFormKnowledge.length,
                classes: ['all'],
                color: ['#fdf9ed', '#e3f1ff', '#f0fbef', '#e6f7ff', '#fef0f0'][Math.floor(Math.random() * 5)]
            };
            abilities.push(newAbility);
        }

        saveAbilities();
        renderTable();
        createModal.classList.remove('show');
    });

    // ==================== 表单标签渲染 ====================

    /**
     * 渲染编辑表单中的标签展示区
     * 每个标签显示为带删除按钮的彩色标签
     */
    function renderFormTags() {
        formTagCount.textContent = tempFormTags.length;
        formTags.innerHTML = '';
        tempFormTags.forEach(function (tag) {
            var el = document.createElement('span');
            el.className = 'form-tag-item';
            var color = tagColors[tempFormTags.indexOf(tag) % tagColors.length];
            el.style.backgroundColor = color;
            el.innerHTML = tag + '<span class="tag-remove" data-tag="' + tag + '">&times;</span>';
            el.querySelector('.tag-remove').addEventListener('click', function (e) {
                e.stopPropagation();
                tempFormTags = tempFormTags.filter(function (t) { return t !== tag; });
                renderFormTags();
            });
            formTags.appendChild(el);
        });
    }

    /**
     * 渲染编辑表单中的知识点展示区
     * 通过知识点 ID 查找名称并显示
     */
    function renderFormKnowledge() {
        formKnowledgeCount.textContent = tempFormKnowledge.length;
        formKnowledgeTags.innerHTML = '';
        tempFormKnowledge.forEach(function (id) {
            var name = findKnowledgeName(knowledgeTree, id);
            if (!name) return;
            var el = document.createElement('span');
            el.className = 'form-tag-item';
            var color = tagColors[tempFormKnowledge.indexOf(id) % tagColors.length];
            el.style.backgroundColor = color;
            el.innerHTML = name + '<span class="tag-remove" data-id="' + id + '">&times;</span>';
            el.querySelector('.tag-remove').addEventListener('click', function (e) {
                e.stopPropagation();
                tempFormKnowledge = tempFormKnowledge.filter(function (k) { return k !== id; });
                renderFormKnowledge();
            });
            formKnowledgeTags.appendChild(el);
        });
    }

    // ==================== 标签选择弹窗 ====================

    /**
     * 打开标签选择弹窗
     * 初始化临时选中列表为当前表单的标签列表
     */
    addTagBtn.addEventListener('click', function () {
        tempTagSelected = tempFormTags.slice();
        renderTagList();
        renderTagSelectedList();
        tagModal.classList.add('show');
    });

    /**
     * 打开知识点选择弹窗
     * 初始化临时选中列表为当前表单的知识点列表
     */
    addKnowledgeBtn.addEventListener('click', function () {
        tempKnowledgeSelected = tempFormKnowledge.slice();
        renderKnowledgeTree();
        renderKnowledgeSelectedList();
        knowledgeModal.classList.add('show');
    });

    /**
     * 渲染标签选择列表
     * 
     * 功能：
     *   - 支持搜索过滤标签
     *   - 每个标签可勾选/取消
     *   - 支持编辑标签名称
     *   - 支持删除标签（同时从所有能力中移除）
     */
    function renderTagList() {
        var search = tagSearchInput.value.toLowerCase();
        var filteredTags = tags.filter(function (t) {
            return !search || t.toLowerCase().includes(search);
        });
        tagList.innerHTML = '';
        filteredTags.forEach(function (tag) {
            var li = document.createElement('li');
            li.innerHTML =
                '<span class="tag-name">' + tag + '</span>' +
                '<div class="tag-actions">' +
                    '<a class="edit-tag-link" data-tag="' + tag + '">编辑</a>' +
                    '<a class="delete delete-tag-link" data-tag="' + tag + '">删除</a>' +
                '</div>' +
                '<span class="tag-check' + (tempTagSelected.includes(tag) ? ' checked' : '') + '"></span>';

            li.querySelector('.tag-check').addEventListener('click', function () {
                var idx = tempTagSelected.indexOf(tag);
                if (idx >= 0) {
                    tempTagSelected.splice(idx, 1);
                    this.classList.remove('checked');
                } else {
                    tempTagSelected.push(tag);
                    this.classList.add('checked');
                }
                renderTagSelectedList();
            });

            li.querySelector('.edit-tag-link').addEventListener('click', function (e) {
                e.stopPropagation();
                var newName = prompt('请输入新的标签名称', tag);
                if (newName && newName.trim()) {
                    var idx = tags.indexOf(tag);
                    if (idx >= 0) {
                        tags[idx] = newName.trim();
                        saveTags();
                        renderTagList();
                        abilities.forEach(function (a) {
                            if (a.tags && a.tags.includes(tag)) {
                                var tagIdx = a.tags.indexOf(tag);
                                a.tags[tagIdx] = newName.trim();
                            }
                        });
                        saveAbilities();
                        renderTable();
                    }
                }
            });

            li.querySelector('.delete-tag-link').addEventListener('click', function (e) {
                e.stopPropagation();
                if (confirm('确定删除标签？')) {
                    tags = tags.filter(function (t) { return t !== tag; });
                    saveTags();
                    renderTagList();
                    abilities.forEach(function (a) {
                        if (a.tags) a.tags = a.tags.filter(function (t) { return t !== tag; });
                    });
                    saveAbilities();
                    renderTable();
                }
            });

            tagList.appendChild(li);
        });
    }

    /**
     * 渲染标签弹窗中已选中的标签列表
     * 显示在弹窗底部，支持点击移除
     */
    function renderTagSelectedList() {
        tagSelectedCount.textContent = tempTagSelected.length;
        tagSelectedList.innerHTML = '';
        tempTagSelected.forEach(function (tag) {
            var el = document.createElement('div');
            el.className = 'tag-selected-item';
            el.innerHTML = tag + '<span class="tag-remove-btn" data-tag="' + tag + '"></span>';
            el.querySelector('.tag-remove-btn').addEventListener('click', function (e) {
                e.stopPropagation();
                tempTagSelected = tempTagSelected.filter(function (t) { return t !== tag; });
                renderTagSelectedList();
                renderTagList();
            });
            tagSelectedList.appendChild(el);
        });
    }

    tagModalClose.addEventListener('click', function () { tagModal.classList.remove('show'); });
    tagBtnCancel.addEventListener('click', function () { tagModal.classList.remove('show'); });

    /**
     * 标签弹窗确认按钮
     * 将临时选中的标签同步到编辑表单
     */
    tagBtnConfirm.addEventListener('click', function () {
        tempFormTags = tempTagSelected.slice();
        renderFormTags();
        tagModal.classList.remove('show');
    });

    // ==================== 新建标签 ====================

    /**
     * 显示新建标签输入框
     */
    newTagBtn.addEventListener('click', function () {
        newTagForm.style.display = 'flex';
        newTagName.value = '';
        newTagName.focus();
    });

    /**
     * 取消新建标签
     */
    newTagCancel.addEventListener('click', function () {
        newTagForm.style.display = 'none';
    });

    /**
     * 确认新建标签
     * 
     * 校验：
     *   - 标签名称不能为空
     *   - 标签名称不能重复
     */
    newTagConfirm.addEventListener('click', function () {
        var name = newTagName.value.trim();
        if (!name) {
            alert('请输入标签名称');
            newTagName.focus();
            return;
        }
        if (tags.includes(name)) {
            alert('标签已存在');
            newTagName.focus();
            return;
        }
        tags.push(name);
        saveTags();
        newTagForm.style.display = 'none';
        renderTagList();
    });

    /**
     * 标签搜索输入事件
     * 实时过滤标签列表
     */
    tagSearchInput.addEventListener('input', function () {
        renderTagList();
    });

    // ==================== 知识点树工具函数 ====================

    /**
     * 在知识点树中递归查找指定 ID 的名称
     * 
     * @param {Array} tree - 知识点树形数据
     * @param {string} id - 要查找的知识点 ID
     * @returns {string|null} 知识点名称，未找到返回 null
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

    /**
     * 统计知识点树中的节点总数
     * 
     * @param {Array} tree - 知识点树形数据
     * @returns {number} 节点总数
     */
    function countKnowledgeTree(tree) {
        var count = 0;
        function traverse(nodes) {
            if (!nodes) return;
            nodes.forEach(function (node) {
                count++;
                if (node.children) traverse(node.children);
            });
        }
        traverse(tree);
        return count;
    }

    // ==================== 知识点树渲染 ====================

    /**
     * 渲染知识点选择弹窗中的树形结构
     */
    function renderKnowledgeTree() {
        knowledgeTreeCount.textContent = countKnowledgeTree(knowledgeTree);
        knowledgeTreeContainer.innerHTML = '';
        knowledgeTree.forEach(function (node) {
            knowledgeTreeContainer.appendChild(createKnowledgeNode(node, 0));
        });
    }

    /**
     * 递归创建知识点树节点
     * 
     * @param {Object} node - 当前知识点节点数据
     * @param {number} level - 当前层级深度（用于计算缩进）
     * @returns {HTMLElement} 树节点 DOM 元素
     * 
     * 节点结构：
     *   - 展开/折叠箭头（仅父节点显示）
     *   - 节点名称文本
     *   - 勾选框
     *   - 子节点列表（可折叠）
     */
    function createKnowledgeNode(node, level) {
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
        check.className = 'tree-check' + (tempKnowledgeSelected.includes(node.id) ? ' checked' : '');
        check.addEventListener('click', function (e) {
            e.stopPropagation();
            var idx = tempKnowledgeSelected.indexOf(node.id);
            if (idx >= 0) {
                tempKnowledgeSelected.splice(idx, 1);
                this.classList.remove('checked');
            } else {
                tempKnowledgeSelected.push(node.id);
                this.classList.add('checked');
            }
            renderKnowledgeSelectedList();
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
                childrenUl.appendChild(createKnowledgeNode(child, level + 1));
            });
            li.appendChild(childrenUl);
            if (tempKnowledgeSelected.some(function (id) {
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
     * 渲染知识点弹窗中已选中的知识点列表
     */
    function renderKnowledgeSelectedList() {
        knowledgeSelectedCount.textContent = tempKnowledgeSelected.length;
        knowledgeSelectedList.innerHTML = '';
        tempKnowledgeSelected.forEach(function (id) {
            var name = findKnowledgeName(knowledgeTree, id);
            if (!name) return;
            var el = document.createElement('div');
            el.className = 'knowledge-selected-item';
            el.innerHTML = name + '<span class="remove-btn" data-id="' + id + '"></span>';
            el.querySelector('.remove-btn').addEventListener('click', function (e) {
                e.stopPropagation();
                tempKnowledgeSelected = tempKnowledgeSelected.filter(function (k) { return k !== id; });
                renderKnowledgeSelectedList();
                renderKnowledgeTree();
            });
            knowledgeSelectedList.appendChild(el);
        });
    }

    knowledgeModalClose.addEventListener('click', function () { knowledgeModal.classList.remove('show'); });
    knowledgeBtnCancel.addEventListener('click', function () { knowledgeModal.classList.remove('show'); });

    /**
     * 知识点弹窗确认按钮
     * 将临时选中的知识点同步到编辑表单
     */
    knowledgeBtnConfirm.addEventListener('click', function () {
        tempFormKnowledge = tempKnowledgeSelected.slice();
        renderFormKnowledge();
        knowledgeModal.classList.remove('show');
    });

    // ==================== 确认弹窗 ====================

    /**
     * 显示通用确认弹窗
     * 
     * @param {string} text - 确认提示文本
     * @param {Function} callback - 确认后的回调函数
     */
    function showConfirm(text, callback) {
        confirmText.textContent = text;
        confirmCallback = callback;
        confirmModal.classList.add('show');
    }

    confirmModalClose.addEventListener('click', function () { confirmModal.classList.remove('show'); confirmCallback = null; });
    confirmBtnCancel.addEventListener('click', function () { confirmModal.classList.remove('show'); confirmCallback = null; });
    confirmBtnConfirm.addEventListener('click', function () {
        confirmModal.classList.remove('show');
        if (confirmCallback) confirmCallback();
        confirmCallback = null;
    });

    // ==================== 删除能力 ====================

    /**
     * 删除指定 ID 的能力条目
     * 
     * @param {string} id - 要删除的能力 ID
     */
    function deleteAbility(id) {
        abilities = abilities.filter(function (a) { return a.id !== id; });
        selectedIds.delete(id);
        saveAbilities();
        renderTable();
        updateBatchBar();
    }

    // ==================== 标签筛选器 ====================

    /**
     * 初始化标签筛选下拉框
     * 
     * 选项：
     *   - "全部"：清除标签筛选
     *   - 各标签名：按标签筛选
     */
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

        tagFilter.addEventListener('click', function (e) {
            e.stopPropagation();
            tagFilter.classList.toggle('open');
        });
    }

    /**
     * 点击页面其他区域关闭标签筛选下拉框
     */
    document.addEventListener('click', function () {
        tagFilter.classList.remove('open');
    });

    /**
     * 名称搜索输入事件
     * 实时按名称过滤表格
     */
    nameFilter.addEventListener('input', function () {
        filterName = this.value;
        renderTable();
    });

    // ==================== 数据导入导出 ====================

    /**
     * 导出按钮 - 将能力数据导出为 JSON 文件下载
     */
    exportBtn.addEventListener('click', function () {
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
    });

    /**
     * 模板导入按钮 - 触发隐藏的文件选择器
     */
    templateImportBtn.addEventListener('click', function () {
        document.getElementById('template-file-input').click();
    });

    /**
     * 文件选择器变化事件 - 读取并解析 JSON 文件导入数据
     * 
     * 校验：
     *   - 文件内容必须是有效的 JSON 数组
     *   - 导入成功后刷新表格
     */
    document.getElementById('template-file-input').addEventListener('change', function (e) {
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
        this.value = '';
    });

    // ==================== 应用初始化入口 ====================

    /**
     * 应用初始化
     * 加载数据 → 初始化筛选器 → 渲染表格
     */
    function init() {
        loadData();
        initTagFilter();
        renderTable();
    }

    init();
})();
