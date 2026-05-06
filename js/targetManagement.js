(function () {
    'use strict';

    const ABILITIES_KEY = 'abilityMapData';
    const TAGS_KEY = 'targetTags';
    const KNOWLEDGE_KEY = 'knowledgeTreeData';

    let abilities = [];
    let tags = [];
    let knowledgeTree = [];
    let selectedIds = new Set();
    let currentEditId = null;
    let tempFormTags = [];
    let tempFormKnowledge = [];
    let tempTagSelected = [];
    let tempKnowledgeSelected = [];
    let confirmCallback = null;
    let filterTag = '';
    let filterName = '';

    const tableBody = document.getElementById('table-body');
    const batchBar = document.getElementById('batch-bar');
    const checkAll = document.getElementById('check-all');
    const backBtn = document.getElementById('back-btn');
    const createBtn = document.getElementById('create-btn');
    const templateImportBtn = document.getElementById('template-import-btn');
    const exportBtn = document.getElementById('export-btn');
    const nameFilter = document.getElementById('name-filter');
    const tagFilter = document.getElementById('tag-filter');
    const tagFilterDropdown = document.getElementById('tag-filter-dropdown');
    const batchDeleteBtn = document.getElementById('batch-delete-btn');

    const createModal = document.getElementById('create-modal-overlay');
    const createModalTitle = document.getElementById('create-modal-title');
    const createModalClose = document.getElementById('create-modal-close');
    const createBtnCancel = document.getElementById('create-btn-cancel');
    const createBtnConfirm = document.getElementById('create-btn-confirm');
    const formName = document.getElementById('form-name');
    const formDesc = document.getElementById('form-desc');
    const formTags = document.getElementById('form-tags');
    const formTagCount = document.getElementById('form-tag-count');
    const formKnowledgeTags = document.getElementById('form-knowledge-tags');
    const formKnowledgeCount = document.getElementById('form-knowledge-count');
    const addTagBtn = document.getElementById('add-tag-btn');
    const addKnowledgeBtn = document.getElementById('add-knowledge-btn');

    const tagModal = document.getElementById('tag-modal-overlay');
    const tagModalClose = document.getElementById('tag-modal-close');
    const tagBtnCancel = document.getElementById('tag-btn-cancel');
    const tagBtnConfirm = document.getElementById('tag-btn-confirm');
    const newTagBtn = document.getElementById('new-tag-btn');
    const newTagForm = document.getElementById('tag-new-form');
    const newTagName = document.getElementById('new-tag-name');
    const newTagConfirm = document.getElementById('new-tag-confirm');
    const newTagCancel = document.getElementById('new-tag-cancel');
    const tagSearchInput = document.getElementById('tag-search-input');
    const tagList = document.getElementById('tag-list');
    const tagSelectedCount = document.getElementById('tag-selected-count');
    const tagSelectedList = document.getElementById('tag-selected-list');

    const knowledgeModal = document.getElementById('knowledge-modal-overlay');
    const knowledgeModalClose = document.getElementById('knowledge-modal-close');
    const knowledgeBtnCancel = document.getElementById('knowledge-btn-cancel');
    const knowledgeBtnConfirm = document.getElementById('knowledge-btn-confirm');
    const knowledgeTreeContainer = document.getElementById('knowledge-tree');
    const knowledgeTreeCount = document.getElementById('knowledge-tree-count');
    const knowledgeSelectedCount = document.getElementById('knowledge-selected-count');
    const knowledgeSelectedList = document.getElementById('knowledge-selected-list');

    const confirmModal = document.getElementById('confirm-modal-overlay');
    const confirmText = document.getElementById('confirm-text');
    const confirmModalClose = document.getElementById('confirm-modal-close');
    const confirmBtnCancel = document.getElementById('confirm-btn-cancel');
    const confirmBtnConfirm = document.getElementById('confirm-btn-confirm');

    const tagColors = ['#F77763', '#67c23a', '#5AC482', '#409eff', '#e6a23c'];

    function loadData() {
        const abilitiesData = localStorage.getItem(ABILITIES_KEY);
        abilities = abilitiesData ? JSON.parse(abilitiesData) : [];

        const tagsData = localStorage.getItem(TAGS_KEY);
        tags = tagsData ? JSON.parse(tagsData) : ['标签1', '标签2', '标签3'];

        const knowledgeData = localStorage.getItem(KNOWLEDGE_KEY);
        knowledgeTree = knowledgeData ? JSON.parse(knowledgeData) : [
            { id: 'k1', name: '身体协调', children: [{ id: 'k1-1', name: '上肢协调' }, { id: 'k1-2', name: '下肢协调' }] },
            { id: 'k2', name: '运动技能', children: [{ id: 'k2-1', name: '跑步技能' }, { id: 'k2-2', name: '跳跃技能' }, { id: 'k2-3', name: '投掷技能' }] },
            { id: 'k3', name: '理论知识', children: [{ id: 'k3-1', name: '运动生理' }, { id: 'k3-2', name: '运动心理' }] },
            { id: 'k4', name: '战术意识', children: [{ id: 'k4-1', name: '进攻战术' }, { id: 'k4-2', name: '防守战术' }] }
        ];
    }

    function saveAbilities() {
        localStorage.setItem(ABILITIES_KEY, JSON.stringify(abilities));
    }

    function saveTags() {
        localStorage.setItem(TAGS_KEY, JSON.stringify(tags));
    }

    function getFilteredAbilities() {
        return abilities.filter(a => {
            let match = true;
            if (filterTag && a.tags && !a.tags.includes(filterTag)) {
                match = false;
            }
            if (filterName && !(a.name || '').toLowerCase().includes(filterName.toLowerCase())) {
                match = false;
            }
            return match;
        });
    }

    function renderTable() {
        const filtered = getFilteredAbilities();
        tableBody.innerHTML = '';

        filtered.forEach((ability, index) => {
            const tr = document.createElement('tr');
            tr.setAttribute('data-id', ability.id);

            const tdCheck = document.createElement('td');
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

            const tdIndex = document.createElement('td');
            tdIndex.className = 'th-index';
            tdIndex.textContent = (index + 1);
            tr.appendChild(tdIndex);

            const tdName = document.createElement('td');
            tdName.className = 'th-name';
            tdName.textContent = ability.name || '';
            tr.appendChild(tdName);

            const tdTags = document.createElement('td');
            tdTags.className = 'th-tags';
            (ability.tags || []).forEach(tag => {
                const tagSpan = document.createElement('span');
                tagSpan.className = 'table-tag';
                const color = tagColors[index % tagColors.length];
                tagSpan.style.borderColor = color;
                tagSpan.style.color = color;
                tagSpan.textContent = tag;
                tdTags.appendChild(tagSpan);
            });
            tr.appendChild(tdTags);

            const tdDesc = document.createElement('td');
            tdDesc.className = 'th-desc';
            const descSpan = document.createElement('span');
            descSpan.className = 'table-desc';
            descSpan.textContent = ability.desc || '';
            tdDesc.appendChild(descSpan);
            tr.appendChild(tdDesc);

            const tdAction = document.createElement('td');
            tdAction.className = 'th-action';

            const editBtn = document.createElement('button');
            editBtn.className = 'action-btn-td';
            editBtn.textContent = '编辑';
            editBtn.addEventListener('click', function () {
                openCreateModal(ability.id);
            });
            tdAction.appendChild(editBtn);

            const deleteBtn = document.createElement('button');
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

    function updateCheckAll() {
        const filtered = getFilteredAbilities();
        checkAll.checked = filtered.length > 0 && filtered.every(a => selectedIds.has(a.id));
    }

    function updateBatchBar() {
        if (selectedIds.size > 0) {
            batchBar.classList.add('show');
        } else {
            batchBar.classList.remove('show');
        }
    }

    checkAll.addEventListener('change', function () {
        const filtered = getFilteredAbilities();
        if (checkAll.checked) {
            filtered.forEach(a => selectedIds.add(a.id));
        } else {
            filtered.forEach(a => selectedIds.delete(a.id));
        }
        renderTable();
        updateBatchBar();
    });

    batchDeleteBtn.addEventListener('click', function () {
        if (selectedIds.size === 0) return;
        showConfirm('确定是否删除选中的内容？', function () {
            abilities = abilities.filter(a => !selectedIds.has(a.id));
            selectedIds.clear();
            saveAbilities();
            renderTable();
            updateBatchBar();
        });
    });

    backBtn.addEventListener('click', function () {
        window.location.href = 'targetMapTeacher.html';
    });

    function openCreateModal(id) {
        currentEditId = id;
        createModalTitle.textContent = id ? '编辑' : '新建';

        if (id) {
            const ability = abilities.find(a => a.id === id);
            if (ability) {
                formName.value = ability.name || '';
                formDesc.value = ability.desc || '';
                tempFormTags = ability.tags ? [...ability.tags] : [];
                tempFormKnowledge = ability.knowledgeIds ? [...ability.knowledgeIds] : [];
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
    createBtnConfirm.addEventListener('click', function () {
        const name = formName.value.trim();
        if (!name) {
            alert('请输入名称');
            formName.focus();
            return;
        }

        const desc = formDesc.value.trim();

        if (currentEditId) {
            const ability = abilities.find(a => a.id === currentEditId);
            if (ability) {
                ability.name = name;
                ability.desc = desc;
                ability.tags = [...tempFormTags];
                ability.knowledgeIds = [...tempFormKnowledge];
                ability.knowledgeCount = tempFormKnowledge.length;
            }
        } else {
            const ability = {
                id: 'ability_' + Date.now(),
                name: name,
                desc: desc,
                tags: [...tempFormTags],
                knowledgeIds: [...tempFormKnowledge],
                knowledgeCount: tempFormKnowledge.length,
                classes: ['all'],
                color: ['#fdf9ed', '#e3f1ff', '#f0fbef', '#e6f7ff', '#fef0f0'][Math.floor(Math.random() * 5)]
            };
            abilities.push(ability);
        }

        saveAbilities();
        renderTable();
        createModal.classList.remove('show');
    });

    function renderFormTags() {
        formTagCount.textContent = tempFormTags.length;
        formTags.innerHTML = '';
        tempFormTags.forEach(tag => {
            const el = document.createElement('span');
            el.className = 'form-tag-item';
            const color = tagColors[tempFormTags.indexOf(tag) % tagColors.length];
            el.style.backgroundColor = color;
            el.innerHTML = tag + '<span class="tag-remove" data-tag="' + tag + '">&times;</span>';
            el.querySelector('.tag-remove').addEventListener('click', function (e) {
                e.stopPropagation();
                tempFormTags = tempFormTags.filter(t => t !== tag);
                renderFormTags();
            });
            formTags.appendChild(el);
        });
    }

    function renderFormKnowledge() {
        formKnowledgeCount.textContent = tempFormKnowledge.length;
        formKnowledgeTags.innerHTML = '';
        tempFormKnowledge.forEach(id => {
            const name = findKnowledgeName(knowledgeTree, id);
            if (!name) return;
            const el = document.createElement('span');
            el.className = 'form-tag-item';
            const color = tagColors[tempFormKnowledge.indexOf(id) % tagColors.length];
            el.style.backgroundColor = color;
            el.innerHTML = name + '<span class="tag-remove" data-id="' + id + '">&times;</span>';
            el.querySelector('.tag-remove').addEventListener('click', function (e) {
                e.stopPropagation();
                tempFormKnowledge = tempFormKnowledge.filter(k => k !== id);
                renderFormKnowledge();
            });
            formKnowledgeTags.appendChild(el);
        });
    }

    addTagBtn.addEventListener('click', function () {
        tempTagSelected = [...tempFormTags];
        renderTagList();
        renderTagSelectedList();
        tagModal.classList.add('show');
    });

    addKnowledgeBtn.addEventListener('click', function () {
        tempKnowledgeSelected = [...tempFormKnowledge];
        renderKnowledgeTree();
        renderKnowledgeSelectedList();
        knowledgeModal.classList.add('show');
    });

    function renderTagList() {
        const search = tagSearchInput.value.toLowerCase();
        const filteredTags = tags.filter(t => !search || t.toLowerCase().includes(search));
        tagList.innerHTML = '';
        filteredTags.forEach(tag => {
            const li = document.createElement('li');
            li.innerHTML =
                '<span class="tag-name">' + tag + '</span>' +
                '<div class="tag-actions">' +
                '<a class="edit-tag-link" data-tag="' + tag + '">编辑</a>' +
                '<a class="delete delete-tag-link" data-tag="' + tag + '">删除</a>' +
                '</div>'+
                '<span class="tag-check' + (tempTagSelected.includes(tag) ? ' checked' : '') + '"></span>' ;

            li.querySelector('.tag-check').addEventListener('click', function () {
                const idx = tempTagSelected.indexOf(tag);
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
                const newName = prompt('请输入新的标签名称', tag);
                if (newName && newName.trim()) {
                    const idx = tags.indexOf(tag);
                    if (idx >= 0) {
                        tags[idx] = newName.trim();
                        saveTags();
                        renderTagList();
                        abilities.forEach(a => {
                            if (a.tags && a.tags.includes(tag)) {
                                const tagIdx = a.tags.indexOf(tag);
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
                    tags = tags.filter(t => t !== tag);
                    saveTags();
                    renderTagList();
                    abilities.forEach(a => {
                        if (a.tags) a.tags = a.tags.filter(t => t !== tag);
                    });
                    saveAbilities();
                    renderTable();
                }
            });

            tagList.appendChild(li);
        });
    }

    function renderTagSelectedList() {
        tagSelectedCount.textContent = tempTagSelected.length;
        tagSelectedList.innerHTML = '';
        tempTagSelected.forEach(tag => {
            const el = document.createElement('div');
            el.className = 'tag-selected-item';
            el.innerHTML = tag + '<span class="tag-remove-btn" data-tag="' + tag + '"></span>';
            el.querySelector('.tag-remove-btn').addEventListener('click', function (e) {
                e.stopPropagation();
                tempTagSelected = tempTagSelected.filter(t => t !== tag);
                renderTagSelectedList();
                renderTagList();
            });
            tagSelectedList.appendChild(el);
        });
    }

    tagModalClose.addEventListener('click', function () { tagModal.classList.remove('show'); });
    tagBtnCancel.addEventListener('click', function () { tagModal.classList.remove('show'); });
    tagBtnConfirm.addEventListener('click', function () {
        tempFormTags = [...tempTagSelected];
        renderFormTags();
        tagModal.classList.remove('show');
    });

    newTagBtn.addEventListener('click', function () {
        newTagForm.style.display = 'flex';
        newTagName.value = '';
        newTagName.focus();
    });

    newTagCancel.addEventListener('click', function () {
        newTagForm.style.display = 'none';
    });

    newTagConfirm.addEventListener('click', function () {
        const name = newTagName.value.trim();
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

    tagSearchInput.addEventListener('input', function () {
        renderTagList();
    });

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

    function countKnowledgeTree(tree) {
        let count = 0;
        function traverse(nodes) {
            if (!nodes) return;
            nodes.forEach(node => {
                count++;
                if (node.children) traverse(node.children);
            });
        }
        traverse(tree);
        return count;
    }

    function renderKnowledgeTree() {
        knowledgeTreeCount.textContent = countKnowledgeTree(knowledgeTree);
        knowledgeTreeContainer.innerHTML = '';
        knowledgeTree.forEach(node => {
            knowledgeTreeContainer.appendChild(createKnowledgeNode(node, 0));
        });
    }

    function createKnowledgeNode(node, level) {
        const li = document.createElement('li');
        li.setAttribute('data-id', node.id);
        const hasChildren = node.children && node.children.length > 0;

        const main = document.createElement('div');
        main.className = 'tree-main';
        main.style.paddingLeft = (14 + level * 20) + 'px';

        if (hasChildren) {
            const arrow = document.createElement('span');
            arrow.className = 'tree-arrow';
            arrow.innerHTML = '<i class="fas fa-chevron-right"></i>';
            arrow.addEventListener('click', function (e) {
                e.stopPropagation();
                arrow.classList.toggle('expanded');
                const children = li.querySelector('.tree-children');
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
        text.className = 'tree-text';
        text.textContent = node.name;
        text.addEventListener('click', function () {
            if (hasChildren) {
                const arrow = main.querySelector('.tree-arrow');
                if (arrow) {
                    arrow.classList.toggle('expanded');
                    const children = li.querySelector('.tree-children');
                    if (children) children.classList.toggle('expanded');
                }
            }
        });
        main.appendChild(text);

        const check = document.createElement('span');
        check.className = 'tree-check' + (tempKnowledgeSelected.includes(node.id) ? ' checked' : '');
        check.addEventListener('click', function (e) {
            e.stopPropagation();
            const idx = tempKnowledgeSelected.indexOf(node.id);
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

        // 点击整个主区域（除勾选框外）展开/折叠子级
        main.addEventListener('click', function (e) {
            if (e.target.closest('.tree-check')) return;
            if (hasChildren) {
                const arrow = main.querySelector('.tree-arrow');
                if (arrow) {
                    arrow.classList.toggle('expanded');
                    const children = li.querySelector('.tree-children');
                    if (children) children.classList.toggle('expanded');
                }
            }
        });

        li.appendChild(main);

        if (hasChildren) {
            const childrenUl = document.createElement('ul');
            childrenUl.className = 'tree-children';
            node.children.forEach(child => {
                childrenUl.appendChild(createKnowledgeNode(child, level + 1));
            });
            li.appendChild(childrenUl);
            if (tempKnowledgeSelected.some(id => node.children.some(c => c.id === id))) {
                const arrow = main.querySelector('.tree-arrow');
                if (arrow) arrow.classList.add('expanded');
                childrenUl.classList.add('expanded');
            }
        }

        return li;
    }

    function renderKnowledgeSelectedList() {
        knowledgeSelectedCount.textContent = tempKnowledgeSelected.length;
        knowledgeSelectedList.innerHTML = '';
        tempKnowledgeSelected.forEach(id => {
            const name = findKnowledgeName(knowledgeTree, id);
            if (!name) return;
            const el = document.createElement('div');
            el.className = 'knowledge-selected-item';
            el.innerHTML = name + '<span class="remove-btn" data-id="' + id + '"></span>';
            el.querySelector('.remove-btn').addEventListener('click', function (e) {
                e.stopPropagation();
                tempKnowledgeSelected = tempKnowledgeSelected.filter(k => k !== id);
                renderKnowledgeSelectedList();
                renderKnowledgeTree();
            });
            knowledgeSelectedList.appendChild(el);
        });
    }

    knowledgeModalClose.addEventListener('click', function () { knowledgeModal.classList.remove('show'); });
    knowledgeBtnCancel.addEventListener('click', function () { knowledgeModal.classList.remove('show'); });
    knowledgeBtnConfirm.addEventListener('click', function () {
        tempFormKnowledge = [...tempKnowledgeSelected];
        renderFormKnowledge();
        knowledgeModal.classList.remove('show');
    });

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

    function deleteAbility(id) {
        abilities = abilities.filter(a => a.id !== id);
        selectedIds.delete(id);
        saveAbilities();
        renderTable();
        updateBatchBar();
    }

    function initTagFilter() {
        const allItem = document.createElement('div');
        allItem.className = 'filter-dropdown-item active';
        allItem.textContent = '全部';
        allItem.addEventListener('click', function () {
            filterTag = '';
            tagFilter.querySelector('.filter-text').textContent = '全部';
            tagFilterDropdown.querySelectorAll('.filter-dropdown-item').forEach(el => el.classList.remove('active'));
            this.classList.add('active');
            tagFilter.classList.remove('open');
            renderTable();
        });
        tagFilterDropdown.appendChild(allItem);

        tags.forEach(tag => {
            const item = document.createElement('div');
            item.className = 'filter-dropdown-item';
            item.textContent = tag;
            item.addEventListener('click', function () {
                filterTag = tag;
                tagFilter.querySelector('.filter-text').textContent = tag;
                tagFilterDropdown.querySelectorAll('.filter-dropdown-item').forEach(el => el.classList.remove('active'));
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

    document.addEventListener('click', function () {
        tagFilter.classList.remove('open');
    });

    nameFilter.addEventListener('input', function () {
        filterName = this.value;
        renderTable();
    });

    exportBtn.addEventListener('click', function () {
        const jsonStr = JSON.stringify(abilities, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'contents_' + Date.now() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    });

    templateImportBtn.addEventListener('click', function () {
        document.getElementById('template-file-input').click();
    });

    document.getElementById('template-file-input').addEventListener('change', function (e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = function (ev) {
            try {
                const data = JSON.parse(ev.target.result);
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

    function init() {
        loadData();
        initTagFilter();
        renderTable();
    }

    init();
})();
