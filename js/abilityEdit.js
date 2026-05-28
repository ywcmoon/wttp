/**
 * abilityEdit.js - 能力编辑功能公共模块
 *
 * 功能概述：
 *   提供能力条目的编辑功能，包括编辑弹窗（名称、描述、标签、关联知识点）、
 *   标签选择弹窗、知识点选择弹窗和确认弹窗的完整交互逻辑。
 *   模块在实例化时自动向页面注入所需的弹窗 DOM，无需在 HTML 中手动编写。
 *   可在能力图谱教师端（targetMapTeacher）和内容管理页面（targetManagement）中复用。
 *
 * 依赖：
 *   - common.js（StorageManager —— 通过配置回调间接使用）
 *   - Font Awesome（图标库）
 *   - common.css（弹窗公共样式）
 *
 * 使用示例：
 *   var editor = new AbilityEdit({
 *       getAbilities: function () { return abilities; },
 *       saveAbilities: function () { saveData(); },
 *       getTags: function () { return tags; },
 *       saveTags: function () { saveTagsToStorage(); },
 *       getKnowledgeTree: function () { return knowledgeTree; },
 *       onSaved: function (ability) { renderAll(); },
 *       tagColors: ['#F77763', '#67c23a', '#5AC482', '#409eff', '#e6a23c']
 *   });
 *   editor.open(abilityId);
 */

var AbilityEdit = (function () {
    'use strict';

    /**
     * AbilityEdit 构造函数
     *
     * @param {Object} config - 配置对象
     * @param {Function} config.getAbilities - 获取 abilities 数组
     * @param {Function} config.saveAbilities - 持久化 abilities
     * @param {Function} config.getTags - 获取 tags 数组
     * @param {Function} config.saveTags - 持久化 tags
     * @param {Function} config.getKnowledgeTree - 获取知识点树数据
     * @param {Function} config.onSaved - 保存成功后的回调，接收编辑后的 ability 对象
     * @param {Array<string>} [config.tagColors] - 标签颜色池，默认 5 种颜色
     */
    function AbilityEdit(config) {
        if (!config) {
            throw new Error('AbilityEdit: config 参数不能为空');
        }

        var requiredMethods = ['getAbilities', 'saveAbilities', 'getTags', 'saveTags', 'getKnowledgeTree', 'onSaved'];
        for (var i = 0; i < requiredMethods.length; i++) {
            if (typeof config[requiredMethods[i]] !== 'function') {
                throw new Error('AbilityEdit: config.' + requiredMethods[i] + ' 必须是一个函数');
            }
        }

        var self = this;
        var tagColors = config.tagColors || ['#F77763', '#67c23a', '#5AC482', '#409eff', '#e6a23c'];

        /* ============================================================
         * 内部状态
         * ============================================================ */

        var currentEditId = null;
        var tempFormTags = [];
        var tempFormKnowledge = [];
        var tempTagSelected = [];
        var tempKnowledgeSelected = [];
        var confirmCallback = null;

        /* ============================================================
         * 动态注入弹窗 DOM
         * ============================================================ */

        var container = document.createElement('div');
        container.id = 'ability-edit-modals';
        container.innerHTML =
            '<div class="modal-overlay" id="create-modal-overlay">' +
                '<div class="modal-content create-modal">' +
                    '<div class="modal-header">' +
                        '<h3 id="create-modal-title">编辑</h3>' +
                        '<button class="modal-close" id="create-modal-close"><i class="fas fa-times"></i></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<form id="create-form">' +
                            '<div class="form-group">' +
                                '<label>名称 <span class="required">*</span></label>' +
                                '<input type="text" class="form-input" id="form-name" required placeholder="请输入名称">' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label>描述</label>' +
                                '<textarea class="form-textarea" id="form-desc" rows="3" placeholder="请输入描述"></textarea>' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label>标签（<span id="form-tag-count">0</span>）</label>' +
                                '<div class="form-tags" id="form-tags"></div>' +
                                '<button type="button" class="btn-add" id="add-tag-btn"><i class="fas fa-plus"></i> 添加</button>' +
                            '</div>' +
                            '<div class="form-group">' +
                                '<label>关联知识点（<span id="form-knowledge-count">0</span>）</label>' +
                                '<div class="form-tags" id="form-knowledge-tags"></div>' +
                                '<button type="button" class="btn-add" id="add-knowledge-btn"><i class="fas fa-plus"></i> 添加</button>' +
                            '</div>' +
                        '</form>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button class="btn btn-cancel" id="create-btn-cancel">取消</button>' +
                        '<button class="btn btn-confirm" id="create-btn-confirm">确定</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="modal-overlay" id="tag-modal-overlay">' +
                '<div class="modal-content tag-modal">' +
                    '<div class="modal-header">' +
                        '<h3>添加标签</h3>' +
                        '<button class="modal-close" id="tag-modal-close"><i class="fas fa-times"></i></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="tag-modal-content">' +
                            '<div class="tag-modal-left">' +
                                '<div class="tag-modal-left-header">' +
                                    '<button class="btn-text" id="new-tag-btn"><i class="fas fa-plus"></i> 新建标签</button>' +
                                    '<div class="tag-search"><input type="text" class="tag-search-input" id="tag-search-input" placeholder="搜索标签"></div>' +
                                '</div>' +
                                '<div class="tag-new-form" id="tag-new-form" style="display:none;">' +
                                    '<input type="text" class="form-input" id="new-tag-name" placeholder="输入标签名称">' +
                                    '<div class="tag-new-actions">' +
                                        '<button class="btn-sm btn-confirm" id="new-tag-confirm">确认</button>' +
                                        '<button class="btn-sm btn-cancel" id="new-tag-cancel">取消</button>' +
                                    '</div>' +
                                '</div>' +
                                '<ul class="tag-list" id="tag-list"></ul>' +
                            '</div>' +
                            '<div class="tag-modal-right">' +
                                '<div class="tag-selected-header">已选中 <span id="tag-selected-count">0</span> 个</div>' +
                                '<div class="tag-selected-list" id="tag-selected-list"></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button class="btn btn-cancel" id="tag-btn-cancel">取消</button>' +
                        '<button class="btn btn-confirm" id="tag-btn-confirm">确定</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="modal-overlay" id="knowledge-modal-overlay">' +
                '<div class="modal-content knowledge-modal">' +
                    '<div class="modal-header">' +
                        '<h3>关联知识点</h3>' +
                        '<button class="modal-close" id="knowledge-modal-close"><i class="fas fa-times"></i></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="knowledge-modal-content">' +
                            '<div class="knowledge-modal-left">' +
                                '<div class="knowledge-modal-left-header">' +
                                    '<span class="knowledge-count">共 <em id="knowledge-tree-count">0</em> 个知识点</span>' +
                                '</div>' +
                                '<ul class="knowledge-tree" id="knowledge-tree"></ul>' +
                            '</div>' +
                            '<div class="knowledge-modal-right">' +
                                '<div class="knowledge-selected-header">已选中 <span id="knowledge-selected-count">0</span> 个</div>' +
                                '<div class="knowledge-selected-list" id="knowledge-selected-list"></div>' +
                            '</div>' +
                        '</div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button class="btn btn-cancel" id="knowledge-btn-cancel">取消</button>' +
                        '<button class="btn btn-confirm" id="knowledge-btn-confirm">确定</button>' +
                    '</div>' +
                '</div>' +
            '</div>' +

            '<div class="modal-overlay" id="confirm-modal-overlay">' +
                '<div class="modal-content confirm-modal">' +
                    '<div class="modal-header">' +
                        '<h3>提示</h3>' +
                        '<button class="modal-close" id="confirm-modal-close"><i class="fas fa-times"></i></button>' +
                    '</div>' +
                    '<div class="modal-body">' +
                        '<div class="confirm-text" id="confirm-text"></div>' +
                    '</div>' +
                    '<div class="modal-footer">' +
                        '<button class="btn btn-cancel" id="confirm-btn-cancel">取消</button>' +
                        '<button class="btn btn-confirm" id="confirm-btn-confirm">确定</button>' +
                    '</div>' +
                '</div>' +
            '</div>';

        document.body.appendChild(container);

        /* ============================================================
         * DOM 元素引用
         * ============================================================ */

        var createModal = document.getElementById('create-modal-overlay');
        var createModalTitle = document.getElementById('create-modal-title');
        var createModalClose = document.getElementById('create-modal-close');
        var formName = document.getElementById('form-name');
        var formDesc = document.getElementById('form-desc');
        var formTagCount = document.getElementById('form-tag-count');
        var formTags = document.getElementById('form-tags');
        var formKnowledgeCount = document.getElementById('form-knowledge-count');
        var formKnowledgeTags = document.getElementById('form-knowledge-tags');
        var addTagBtn = document.getElementById('add-tag-btn');
        var addKnowledgeBtn = document.getElementById('add-knowledge-btn');
        var createBtnCancel = document.getElementById('create-btn-cancel');
        var createBtnConfirm = document.getElementById('create-btn-confirm');

        var tagModal = document.getElementById('tag-modal-overlay');
        var tagModalClose = document.getElementById('tag-modal-close');
        var tagSearchInput = document.getElementById('tag-search-input');
        var tagList = document.getElementById('tag-list');
        var tagSelectedCount = document.getElementById('tag-selected-count');
        var tagSelectedList = document.getElementById('tag-selected-list');
        var tagBtnCancel = document.getElementById('tag-btn-cancel');
        var tagBtnConfirm = document.getElementById('tag-btn-confirm');
        var newTagBtn = document.getElementById('new-tag-btn');
        var tagNewForm = document.getElementById('tag-new-form');
        var newTagName = document.getElementById('new-tag-name');
        var newTagConfirm = document.getElementById('new-tag-confirm');
        var newTagCancel = document.getElementById('new-tag-cancel');

        var knowledgeModal = document.getElementById('knowledge-modal-overlay');
        var knowledgeModalClose = document.getElementById('knowledge-modal-close');
        var knowledgeTreeCount = document.getElementById('knowledge-tree-count');
        var knowledgeTreeContainer = document.getElementById('knowledge-tree');
        var knowledgeSelectedCount = document.getElementById('knowledge-selected-count');
        var knowledgeSelectedList = document.getElementById('knowledge-selected-list');
        var knowledgeBtnCancel = document.getElementById('knowledge-btn-cancel');
        var knowledgeBtnConfirm = document.getElementById('knowledge-btn-confirm');

        var confirmModal = document.getElementById('confirm-modal-overlay');
        var confirmText = document.getElementById('confirm-text');
        var confirmModalClose = document.getElementById('confirm-modal-close');
        var confirmBtnCancel = document.getElementById('confirm-btn-cancel');
        var confirmBtnConfirm = document.getElementById('confirm-btn-confirm');

        /* ============================================================
         * 工具函数
         * ============================================================ */

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

        /* ============================================================
         * 编辑弹窗
         * ============================================================ */

        function openEditModal(abilityId) {
            currentEditId = abilityId;
            createModalTitle.textContent = abilityId ? '编辑' : '新建';

            if (abilityId) {
                var abilities = config.getAbilities();
                var ability = abilities.find(function (a) { return a.id === abilityId; });
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

        function confirmEdit() {
            var name = formName.value.trim();
            if (!name) {
                alert('请输入名称');
                formName.focus();
                return;
            }

            var desc = formDesc.value.trim();

            if (currentEditId) {
                var abilities = config.getAbilities();
                var ability = abilities.find(function (a) { return a.id === currentEditId; });
                if (ability) {
                    ability.name = name;
                    ability.desc = desc;
                    ability.tags = tempFormTags.slice();
                    ability.knowledgeIds = tempFormKnowledge.slice();
                    ability.knowledgeCount = tempFormKnowledge.length;
                }
                config.saveAbilities();
                createModal.classList.remove('show');
                currentEditId = null;
                config.onSaved(ability);
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
                config.getAbilities().push(newAbility);
                config.saveAbilities();
                createModal.classList.remove('show');
                currentEditId = null;
                config.onSaved(newAbility);
            }
        }

        /* ============================================================
         * 表单标签 / 知识点渲染
         * ============================================================ */

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

        function renderFormKnowledge() {
            var tree = config.getKnowledgeTree();
            formKnowledgeCount.textContent = tempFormKnowledge.length;
            formKnowledgeTags.innerHTML = '';
            tempFormKnowledge.forEach(function (id) {
                var name = findKnowledgeName(tree, id);
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

        /* ============================================================
         * 标签选择弹窗
         * ============================================================ */

        function openTagModal() {
            tempTagSelected = tempFormTags.slice();
            renderTagList();
            renderTagSelectedList();
            tagModal.classList.add('show');
        }

        function renderTagList() {
            var keyword = (tagSearchInput.value || '').toLowerCase();
            var tags = config.getTags();
            var filtered = tags.filter(function (tag) {
                return !keyword || tag.toLowerCase().includes(keyword);
            });

            tagList.innerHTML = '';
            filtered.forEach(function (tag) {
                var li = document.createElement('li');
                var isSelected = tempTagSelected.indexOf(tag) !== -1;
                li.innerHTML =
                    '<span class="tag-name">' + tag + '</span>' +
                    '<span class="tag-check' + (isSelected ? ' checked' : '') + '"></span>' +
                    '<span class="tag-actions">' +
                        '<a class="delete">删除</a>' +
                    '</span>';

                li.addEventListener('click', function (e) {
                    if (e.target.closest('.delete')) {
                        e.stopPropagation();
                        var tagsData = config.getTags();
                        var idx = tagsData.indexOf(tag);
                        if (idx !== -1) {
                            tagsData.splice(idx, 1);
                            config.saveTags();
                            tempTagSelected = tempTagSelected.filter(function (t) { return t !== tag; });
                            renderTagList();
                            renderTagSelectedList();
                        }
                        return;
                    }

                    var idx = tempTagSelected.indexOf(tag);
                    if (idx === -1) {
                        tempTagSelected.push(tag);
                    } else {
                        tempTagSelected.splice(idx, 1);
                    }
                    renderTagList();
                    renderTagSelectedList();
                });

                tagList.appendChild(li);
            });
        }

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

        function confirmTagSelection() {
            tempFormTags = tempTagSelected.slice();
            renderFormTags();
            tagModal.classList.remove('show');
        }

        /* ============================================================
         * 知识点选择弹窗
         * ============================================================ */

        function openKnowledgeModal() {
            window._abilityEditKnowledgeMode = true;
            var tree = config.getKnowledgeTree();
            tempKnowledgeSelected = tempFormKnowledge.slice();
            knowledgeTreeCount.textContent = countKnowledgeTree(tree);
            renderKnowledgeTree();
            renderKnowledgeSelectedList();
            knowledgeModal.classList.add('show');
        }

        function renderKnowledgeTree() {
            var tree = config.getKnowledgeTree();
            knowledgeTreeContainer.innerHTML = '';
            tree.forEach(function (node) {
                knowledgeTreeContainer.appendChild(createKnowledgeNode(node, 0));
            });
        }

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
            check.className = 'tree-check' + (tempKnowledgeSelected.indexOf(node.id) !== -1 ? ' checked' : '');
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

        function renderKnowledgeSelectedList() {
            var tree = config.getKnowledgeTree();
            knowledgeSelectedCount.textContent = tempKnowledgeSelected.length;
            knowledgeSelectedList.innerHTML = '';
            tempKnowledgeSelected.forEach(function (id) {
                var name = findKnowledgeName(tree, id);
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

        function confirmKnowledgeSelection() {
            window._abilityEditKnowledgeMode = false;
            tempFormKnowledge = tempKnowledgeSelected.slice();
            renderFormKnowledge();
            knowledgeModal.classList.remove('show');
        }

        /* ============================================================
         * 确认弹窗
         * ============================================================ */

        function showConfirm(text, callback) {
            confirmText.textContent = text;
            confirmCallback = callback;
            confirmModal.classList.add('show');
        }

        /* ============================================================
         * 事件绑定
         * ============================================================ */

        function bindEvents() {
            createModalClose.addEventListener('click', function () { createModal.classList.remove('show'); });
            createBtnCancel.addEventListener('click', function () { createModal.classList.remove('show'); });
            createBtnConfirm.addEventListener('click', confirmEdit);

            addTagBtn.addEventListener('click', openTagModal);
            addKnowledgeBtn.addEventListener('click', openKnowledgeModal);

            tagModalClose.addEventListener('click', function () { tagModal.classList.remove('show'); });
            tagBtnCancel.addEventListener('click', function () { tagModal.classList.remove('show'); });
            tagBtnConfirm.addEventListener('click', confirmTagSelection);

            newTagBtn.addEventListener('click', function () {
                tagNewForm.style.display = 'flex';
                newTagName.value = '';
                newTagName.focus();
            });
            newTagCancel.addEventListener('click', function () {
                tagNewForm.style.display = 'none';
            });
            newTagConfirm.addEventListener('click', function () {
                var name = newTagName.value.trim();
                if (!name) {
                    alert('请输入标签名称');
                    newTagName.focus();
                    return;
                }
                var tagsData = config.getTags();
                if (tagsData.indexOf(name) !== -1) {
                    alert('标签已存在');
                    newTagName.focus();
                    return;
                }
                tagsData.push(name);
                config.saveTags();
                tagNewForm.style.display = 'none';
                renderTagList();
            });

            tagSearchInput.addEventListener('input', function () {
                renderTagList();
            });

            knowledgeModalClose.addEventListener('click', function () {
                window._abilityEditKnowledgeMode = false;
                knowledgeModal.classList.remove('show');
            });
            knowledgeBtnCancel.addEventListener('click', function () {
                window._abilityEditKnowledgeMode = false;
                knowledgeModal.classList.remove('show');
            });
            knowledgeBtnConfirm.addEventListener('click', confirmKnowledgeSelection);

            confirmModalClose.addEventListener('click', function () { confirmModal.classList.remove('show'); confirmCallback = null; });
            confirmBtnCancel.addEventListener('click', function () { confirmModal.classList.remove('show'); confirmCallback = null; });
            confirmBtnConfirm.addEventListener('click', function () {
                confirmModal.classList.remove('show');
                if (confirmCallback) confirmCallback();
                confirmCallback = null;
            });
        }

        bindEvents();

        /* ============================================================
         * 公开方法
         * ============================================================ */

        this.open = function (abilityId) {
            openEditModal(abilityId);
        };

        this.create = function () {
            openEditModal(null);
        };

        this.confirm = function (text, callback) {
            showConfirm(text, callback);
        };
    }

    return AbilityEdit;
})();
