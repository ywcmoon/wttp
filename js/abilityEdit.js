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
 *   - abilityEditTemplates.js（提供 __abilityEditModalsHTML__ 模板变量）
 *
 * 使用示例：
 *   var editor = await new AbilityEdit({
 *       getAbilities: function () { return abilities; },
 *       saveAbilities: function () { saveData(); },
 *       getTags: function () { return tags; },
 *       saveTags: function () { saveTagsToStorage(); },
 *       getKnowledgeTree: function () { return knowledgeTree; },
 *       onSaved: function (ability) { renderAll(); },
 *       tagColors: ['#F77763', '#67c23a', '#5AC482', '#409eff', '#e6a23c']
 *   });
 *   editor.open(abilityId);       // 编辑指定能力
 *   editor.create();               // 新建能力
 *   editor.confirm('确认删除？', fn); // 确认弹窗
 */

var AbilityEdit = (function () {
    'use strict';

    /**
     * AbilityEdit 构造函数
     *
     * 注意：构造函数返回 Promise，调用方必须使用 await 或 .then() 来获取实例。
     * 这是异步设计的原因：构造函数内部需要 await fetch() 加载模板文件。
     *
     * @param {Object} config - 配置对象，所有回调均为必传
     * @param {Function} config.getAbilities - 获取当前全部 abilities 数组的回调
     * @param {Function} config.saveAbilities - 持久化 abilities 数据的回调
     * @param {Function} config.getTags - 获取当前全部标签数组的回调
     * @param {Function} config.saveTags - 持久化标签数据的回调
     * @param {Function} config.getKnowledgeTree - 获取知识点树数组的回调
     * @param {Function} config.onSaved - 保存成功后触发的回调，参数为被保存的 ability 对象
     * @param {Array<string>} [config.tagColors] - 标签颜色池，可选，默认 5 种颜色
     * @returns {Promise<Object>} 编辑模块的公开 API：{ open, create, confirm }
     * @throws {Error} config 为空或缺少必需回调函数时抛出
     */
    function AbilityEdit(config) {
        // 参数校验：config 不能为空
        if (!config) {
            throw new Error('AbilityEdit: config 参数不能为空');
        }

        // 参数校验：确保所有必需的回调函数都已传入
        var requiredMethods = ['getAbilities', 'saveAbilities', 'getTags', 'saveTags', 'getKnowledgeTree', 'onSaved'];
        for (var i = 0; i < requiredMethods.length; i++) {
            if (typeof config[requiredMethods[i]] !== 'function') {
                throw new Error('AbilityEdit: config.' + requiredMethods[i] + ' 必须是一个函数');
            }
        }

        // 颜色池：用于标签圆点、已选标签背景等，循环取色
        var tagColors = config.tagColors || ['#F77763', '#67c23a', '#5AC482', '#409eff', '#e6a23c'];

        /**
         * 返回 async IIFE 执行结果。
         *
         * 之所以使用 async，是因为模块需要等待 DOM 准备完毕（fetch 模板）。
         * 整个初始化流程在 async 函数体内依次执行：
         *   1) 注入弹窗 DOM → 2) 获取所有 DOM 引用 → 3) 绑定事件 → 4) 返回 API。
         */
        return (async function () {

            /* ============================================================
             * 一、动态注入弹窗 DOM
             *
             * 本模块使用的四个弹窗（编辑、标签、知识点、确认）并非写在 HTML 中，
             * 而是在构造时动态注入到 <body> 末尾。
             *
             * DOM 来源优先级：
             *   1) window.__abilityEditModalsHTML__（由 abilityEditTemplates.js 提供）
             *   2) fetch('abilityEditModals.html')（HTTP 服务器环境降级兜底）
             *
             * 这样设计的目的是让模块自包含，调用方只需引入脚本即可，无需关心 HTML。
             * ============================================================ */

            // 创建一个容器 div，用于承载所有弹窗 HTML
            var container = document.createElement('div');
            container.id = 'ability-edit-modals';

            // 优先从全局变量获取模板（文件协议不受 CORS 限制）
            var html = window.__abilityEditModalsHTML__ || '';
            if (!html) {
                // 兜底：尝试通过 fetch 加载（适用于 HTTP 服务器环境）
                try {
                    var response = await fetch('abilityEditModals.html');
                    if (response.ok) {
                        html = await response.text();
                    }
                } catch (e) {
                    // fetch 失败（如 file:// CORS 拦截），静默处理；
                    // 此时 html 仍为空字符串，会导致后续 getElementById 返回 null。
                    // 正常情况下 __abilityEditModalsHTML__ 已由 abilityEditTemplates.js 提供。
                }
            }

            // 将弹窗 HTML 注入容器并挂载到页面
            container.innerHTML = html;
            document.body.appendChild(container);

            /* ============================================================
             * 二、DOM 元素引用
             *
             * 一次性获取所有弹窗内部元素的引用并缓存为变量。
             * 后续所有操作都通过这些变量进行，避免重复查询 DOM。
             *
             * 分为四组：
             *   1) 编辑弹窗（create）
             *   2) 标签选择弹窗（tag）
             *   3) 知识点选择弹窗（knowledge）
             *   4) 确认提示弹窗（confirm）
             * ============================================================ */

            // --- 编辑弹窗（create-modal）相关 DOM 引用 ---
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

            // --- 标签选择弹窗（tag-modal）相关 DOM 引用 ---
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

            // --- 知识点选择弹窗（knowledge-modal）相关 DOM 引用 ---
            var knowledgeModal = document.getElementById('knowledge-modal-overlay');
            var knowledgeModalClose = document.getElementById('knowledge-modal-close');
            var knowledgeTreeCount = document.getElementById('knowledge-tree-count');
            var knowledgeTreeContainer = document.getElementById('knowledge-tree');
            var knowledgeSelectedCount = document.getElementById('knowledge-selected-count');
            var knowledgeSelectedList = document.getElementById('knowledge-selected-list');
            var knowledgeBtnCancel = document.getElementById('knowledge-btn-cancel');
            var knowledgeBtnConfirm = document.getElementById('knowledge-btn-confirm');

            // --- 确认提示弹窗（confirm-modal）相关 DOM 引用 ---
            var confirmModal = document.getElementById('confirm-modal-overlay');
            var confirmText = document.getElementById('confirm-text');
            var confirmModalClose = document.getElementById('confirm-modal-close');
            var confirmBtnCancel = document.getElementById('confirm-btn-cancel');
            var confirmBtnConfirm = document.getElementById('confirm-btn-confirm');

            /* ============================================================
             * 三、内部状态
             *
             * 这些变量在模块实例生命周期内保持，用于跟踪当前编辑操作的状态。
             * ============================================================ */

            /** @type {string|null} 当前正在编辑的能力 ID，null 表示新建模式 */
            var currentEditId = null;

            /** @type {Array<string>} 编辑弹窗中当前选中的标签列表（临时） */
            var tempFormTags = [];

            /** @type {Array<string>} 编辑弹窗中当前选中的知识点 ID 列表（临时） */
            var tempFormKnowledge = [];

            /** @type {Array<string>} 标签弹窗中当前选中的标签列表（临时） */
            var tempTagSelected = [];

            /** @type {Array<string>} 知识点弹窗中当前选中的知识点 ID 列表（临时） */
            var tempKnowledgeSelected = [];

            /** @type {Function|null} 确认弹窗的回调函数，点击确定时执行 */
            var confirmCallback = null;

            /* ============================================================
             * 四、工具函数
             * ============================================================ */

            /**
             * 在知识点树中递归查找指定 ID 对应的名称
             *
             * 知识点树是多层嵌套结构，每层节点可能包含 children 子节点。
             * 此函数采用深度优先遍历，找到第一个匹配节点即返回。
             *
             * @param {Array<Object>} tree - 知识点树数组
             * @param {string} id - 要查找的知识点 ID
             * @returns {string|null} 找到的名称，或 null（未找到时）
             */
            function findKnowledgeName(tree, id) {
                for (var i = 0; i < tree.length; i++) {
                    var node = tree[i];
                    if (node.id === id) return node.name;
                    // 递归搜索子节点
                    if (node.children) {
                        var result = findKnowledgeName(node.children, id);
                        if (result) return result;
                    }
                }
                return null;
            }

            /**
             * 统计知识点树中所有节点的总数（含多层嵌套）
             *
             * 用于在知识点弹窗顶部显示「共 N 个知识点」。
             *
             * @param {Array<Object>} tree - 知识点树数组
             * @returns {number} 节点总数
             */
            function countKnowledgeTree(tree) {
                var count = 0;

                /**
                 * 内部递归遍历函数
                 * @param {Array<Object>} nodes - 当前层级的节点数组
                 */
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
             * 五、编辑弹窗（create-modal）
             *
             * 编辑弹窗是核心功能弹窗，支持两种模式：
             *   - 编辑模式：传入已有 abilityId，回填名称、描述、标签、知识点
             *   - 新建模式：不传 abilityId，所有字段为空
             * ============================================================ */

            /**
             * 打开编辑弹窗
             *
             * @param {string|null} abilityId - 要编辑的能力 ID，null 表示新建
             *
             * 流程：
             *   1. 设置模式（编辑/新建）
             *   2. 如果是编辑模式，从 abilities 中查找对应数据并回填表单
             *   3. 刷新标签和知识点的表单预览
             *   4. 显示弹窗
             */
            function openEditModal(abilityId) {
                // 记录当前编辑的 ID（null = 新建模式）
                currentEditId = abilityId;
                createModalTitle.textContent = abilityId ? '编辑' : '新建';

                if (abilityId) {
                    // --- 编辑模式：回填已有数据 ---
                    var abilities = config.getAbilities();
                    var ability = abilities.find(function (a) { return a.id === abilityId; });
                    if (ability) {
                        formName.value = ability.name || '';
                        formDesc.value = ability.desc || '';
                        // slice() 创建副本，避免直接引用原数组导致外部数据被意外修改
                        tempFormTags = ability.tags ? ability.tags.slice() : [];
                        tempFormKnowledge = ability.knowledgeIds ? ability.knowledgeIds.slice() : [];
                    }
                } else {
                    // --- 新建模式：清空所有字段 ---
                    formName.value = '';
                    formDesc.value = '';
                    tempFormTags = [];
                    tempFormKnowledge = [];
                }

                // 刷新表单中的标签和知识点预览
                renderFormTags();
                renderFormKnowledge();

                // 显示弹窗（通过 CSS 类 .show 控制 display/opacity）
                createModal.classList.add('show');
            }

            /**
             * 确认编辑/新建操作
             *
             * 流程：
             *   1. 校验名称非空
             *   2. 如果是编辑模式，更新已有 ability 对象
             *   3. 如果是新建模式，创建新 ability 对象并推入数组
             *   4. 持久化数据
             *   5. 关闭弹窗并触发 onSaved 回调
             */
            function confirmEdit() {
                // 校验：名称不能为空
                var name = formName.value.trim();
                if (!name) {
                    alert('请输入名称');
                    formName.focus();
                    return;
                }

                var desc = formDesc.value.trim();

                if (currentEditId) {
                    // === 编辑模式 ===
                    var abilities = config.getAbilities();
                    var ability = abilities.find(function (a) { return a.id === currentEditId; });
                    if (ability) {
                        // 将表单中的临时数据写回原对象
                        ability.name = name;
                        ability.desc = desc;
                        ability.tags = tempFormTags.slice();
                        ability.knowledgeIds = tempFormKnowledge.slice();
                        ability.knowledgeCount = tempFormKnowledge.length;
                    }
                    // 持久化
                    config.saveAbilities();
                    // 关闭弹窗
                    createModal.classList.remove('show');
                    currentEditId = null;
                    // 通知调用方保存完成
                    config.onSaved(ability);
                } else {
                    // === 新建模式 ===
                    var newAbility = {
                        id: 'ability_' + Date.now(),  // 时间戳作为唯一 ID
                        name: name,
                        desc: desc,
                        tags: tempFormTags.slice(),
                        knowledgeIds: tempFormKnowledge.slice(),
                        knowledgeCount: tempFormKnowledge.length,
                        classes: ['all'],  // 默认对全部班级可见
                        // 随机选取一种预设颜色
                        color: ['#fdf9ed', '#e3f1ff', '#f0fbef', '#e6f7ff', '#fef0f0'][Math.floor(Math.random() * 5)]
                    };
                    // 推入数组并持久化
                    config.getAbilities().push(newAbility);
                    config.saveAbilities();
                    // 关闭弹窗
                    createModal.classList.remove('show');
                    currentEditId = null;
                    // 通知调用方保存完成
                    config.onSaved(newAbility);
                }
            }

            /* ============================================================
             * 六、表单标签 / 知识点预览渲染
             *
             * 在编辑弹窗主表单中，标签和知识点以彩色标签（badge）形式预览展示，
             * 每个标签右侧有 × 按钮可以移除。
             * ============================================================ */

            /**
             * 渲染编辑弹窗中的标签预览区
             *
             * 根据 tempFormTags 数组动态生成彩色标签元素，
             * 点击 × 可从临时数组中移除对应标签并重新渲染。
             */
            function renderFormTags() {
                // 更新标签计数
                formTagCount.textContent = tempFormTags.length;
                formTags.innerHTML = '';

                tempFormTags.forEach(function (tag) {
                    var el = document.createElement('span');
                    el.className = 'form-tag-item';
                    // 从颜色池中按索引取色，循环使用
                    var color = tagColors[tempFormTags.indexOf(tag) % tagColors.length];
                    el.style.backgroundColor = color;
                    // 标签文本 + 删除按钮
                    el.innerHTML = tag + '<span class="tag-remove" data-tag="' + tag + '">&times;</span>';
                    // 删除按钮事件：从临时数组中移除并重新渲染
                    el.querySelector('.tag-remove').addEventListener('click', function (e) {
                        e.stopPropagation();
                        tempFormTags = tempFormTags.filter(function (t) { return t !== tag; });
                        renderFormTags();
                    });
                    formTags.appendChild(el);
                });
            }

            /**
             * 渲染编辑弹窗中的知识点预览区
             *
             * 和 renderFormTags 类似，但根据知识点 ID 从知识树中查找名称显示。
             */
            function renderFormKnowledge() {
                var tree = config.getKnowledgeTree();
                formKnowledgeCount.textContent = tempFormKnowledge.length;
                formKnowledgeTags.innerHTML = '';

                tempFormKnowledge.forEach(function (id) {
                    // 通过 ID 查找知识点名称
                    var name = findKnowledgeName(tree, id);
                    if (!name) return;  // 知识点不存在则跳过

                    var el = document.createElement('span');
                    el.className = 'form-tag-item';
                    var color = tagColors[tempFormKnowledge.indexOf(id) % tagColors.length];
                    el.style.backgroundColor = color;
                    el.innerHTML = name + '<span class="tag-remove" data-id="' + id + '">&times;</span>';
                    // × 按钮：从临时数组中移除并重新渲染
                    el.querySelector('.tag-remove').addEventListener('click', function (e) {
                        e.stopPropagation();
                        tempFormKnowledge = tempFormKnowledge.filter(function (k) { return k !== id; });
                        renderFormKnowledge();
                    });
                    formKnowledgeTags.appendChild(el);
                });
            }

            /* ============================================================
             * 七、标签选择弹窗（tag-modal）
             *
             * 提供标签的搜索、勾选、新建、删除功能。
             * 弹窗分为左右两栏：
             *   左栏：标签列表（含搜索框、新建按钮、删除按钮）
             *   右栏：已选中标签预览
             * ============================================================ */

            /**
             * 打开标签选择弹窗
             *
             * 初始化临时选中列表为当前编辑弹窗中已有的标签，
             * 渲染标签列表和已选中列表后显示弹窗。
             */
            function openTagModal() {
                // slice() 创建副本，弹窗操作不影响原数据直到用户点击确定
                tempTagSelected = tempFormTags.slice();
                renderTagList();
                renderTagSelectedList();
                tagModal.classList.add('show');
            }

            /**
             * 渲染标签列表（左栏）
             *
             * 从 config.getTags() 获取所有标签，根据搜索关键词过滤，
             * 勾选状态由 tempTagSelected 决定。
             *
             * 交互：
             *   - 点击标签名 → 行内编辑（Enter 保存 / Escape 取消）
             *   - 点击行空白或勾选框 → 切换勾选/取消勾选
             *   - hover 行 → 显示删除按钮（勾选框位置固定不动）
             *   - 点击「删除」→ 从标签库中永久删除该标签
             */
            function renderTagList() {
                // 获取搜索关键词（转小写以支持不区分大小写搜索）
                var keyword = (tagSearchInput.value || '').toLowerCase();
                var tags = config.getTags();

                // 按关键词过滤
                var filtered = tags.filter(function (tag) {
                    return !keyword || tag.toLowerCase().includes(keyword);
                });

                tagList.innerHTML = '';

                filtered.forEach(function (tag) {
                    var li = document.createElement('li');
                    // 判断当前标签是否已被临时选中
                    var isSelected = tempTagSelected.indexOf(tag) !== -1;

                    // 行内 HTML：标签名 + 删除按钮（hover 显示） + 勾选框（位置固定）
                    li.innerHTML =
                        '<span class="tag-name">' + tag + '</span>' +
                        '<span class="tag-actions">' +
                        '<a class="delete">删除</a>' +
                        '</span>' +
                        '<span class="tag-check' + (isSelected ? ' checked' : '') + '"></span>';

                    // 行点击事件
                    li.addEventListener('click', function (e) {
                        // 点击「删除」按钮：从标签库中移除
                        if (e.target.closest('.delete')) {
                            e.stopPropagation();
                            var tagsData = config.getTags();
                            var idx = tagsData.indexOf(tag);
                            if (idx !== -1) {
                                tagsData.splice(idx, 1);      // 从标签库删除
                                config.saveTags();             // 持久化
                                // 同步从临时选中列表移除
                                tempTagSelected = tempTagSelected.filter(function (t) { return t !== tag; });
                                // 刷新左右两栏
                                renderTagList();
                                renderTagSelectedList();
                            }
                            return;
                        }

                        // 点击标签名：进入编辑模式
                        var nameSpan = this.querySelector('.tag-name');
                        if (e.target === nameSpan || e.target.closest('.tag-name') === nameSpan) {
                            e.stopPropagation();
                            startTagEdit(nameSpan, tag);
                            return;
                        }

                        // 点击行空白或勾选框：切换勾选状态
                        if (e.target.closest('.tag-name-edit')) return;

                        var idx = tempTagSelected.indexOf(tag);
                        if (idx === -1) {
                            tempTagSelected.push(tag);  // 勾选
                        } else {
                            tempTagSelected.splice(idx, 1);  // 取消勾选
                        }
                        // 刷新左右两栏
                        renderTagList();
                        renderTagSelectedList();
                    });

                    tagList.appendChild(li);
                });
            }

            /**
             * 启动标签行内编辑
             *
             * 将 tag-name span 替换为 input，支持 Enter 保存、Escape 取消。
             * 编辑期间阻止行的勾选/删除等其他事件。
             *
             * @param {HTMLElement} nameSpan - 标签名 span 元素
             * @param {string} oldName - 原标签名
             */
            function startTagEdit(nameSpan, oldName) {
                var input = document.createElement('input');
                input.type = 'text';
                input.className = 'tag-name-edit';
                input.value = oldName;
                nameSpan.replaceWith(input);
                input.focus();
                input.select();

                function saveEdit() {
                    var newName = input.value.trim();
                    if (newName && newName !== oldName) {
                        var tagsData = config.getTags();
                        var idx = tagsData.indexOf(oldName);
                        if (idx !== -1) {
                            // 检查新名称是否重复
                            if (tagsData.indexOf(newName) !== -1) {
                                alert('标签已存在');
                                input.value = oldName;
                                input.focus();
                                return;
                            }
                            tagsData[idx] = newName;
                            config.saveTags();
                            // 同步更新临时选中列表中的标签名
                            var selIdx = tempTagSelected.indexOf(oldName);
                            if (selIdx !== -1) tempTagSelected[selIdx] = newName;
                        }
                    }
                    renderTagList();
                    renderTagSelectedList();
                }

                function cancelEdit() {
                    renderTagList();
                    renderTagSelectedList();
                }

                input.addEventListener('keydown', function (e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        saveEdit();
                    } else if (e.key === 'Escape') {
                        e.preventDefault();
                        cancelEdit();
                    }
                });

                input.addEventListener('blur', function () {
                    cancelEdit();
                });
            }

            /**
             * 渲染已选中标签列表（右栏）
             *
             * 展示 tempTagSelected 中的所有标签，
             * 每个标签右侧有移除按钮可单独取消勾选。
             */
            function renderTagSelectedList() {
                tagSelectedCount.textContent = tempTagSelected.length;
                tagSelectedList.innerHTML = '';

                tempTagSelected.forEach(function (tag) {
                    var el = document.createElement('div');
                    el.className = 'tag-selected-item';
                    el.innerHTML = tag + '<span class="tag-remove-btn" data-tag="' + tag + '"></span>';

                    // 移除按钮事件
                    el.querySelector('.tag-remove-btn').addEventListener('click', function (e) {
                        e.stopPropagation();
                        tempTagSelected = tempTagSelected.filter(function (t) { return t !== tag; });
                        // 刷新左右两栏
                        renderTagSelectedList();
                        renderTagList();
                    });

                    tagSelectedList.appendChild(el);
                });
            }

            /**
             * 确认标签选择
             *
             * 将临时选中列表写回 tempFormTags 并刷新编辑弹窗中的标签预览，
             * 然后关闭标签弹窗。
             */
            function confirmTagSelection() {
                tempFormTags = tempTagSelected.slice();  // slice() 确保副本
                renderFormTags();                        // 刷新编辑弹窗标签预览
                tagModal.classList.remove('show');
            }

            /* ============================================================
             * 八、知识点选择弹窗（knowledge-modal）
             *
             * 以树形结构展示全部知识点，支持多层嵌套的展开/折叠交互。
             *
             * 弹窗分为左右两栏：
             *   左栏：知识点树（层级缩进、箭头展开折叠、勾选框）
             *   右栏：已选中知识点预览
             *
             * 知识点数据格式：
             *   [{ id, name, children: [{ id, name, children: [...] }] }]
             * ============================================================ */

            /**
             * 打开知识点选择弹窗
             *
             * 初始化临时选中列表为当前编辑弹窗中已有的知识点 ID，
             * 计算知识点总数并渲染树和已选中列表后显示弹窗。
             */
            function openKnowledgeModal() {
                // 设置全局标志，targetMapTeacher.js 中也有同名弹窗，
                // 此标志用于区分是谁打开的，避免事件冲突
                window._abilityEditKnowledgeMode = true;

                var tree = config.getKnowledgeTree();
                tempKnowledgeSelected = tempFormKnowledge.slice();  // 副本
                knowledgeTreeCount.textContent = countKnowledgeTree(tree);  // 统计总数
                renderKnowledgeTree();
                renderKnowledgeSelectedList();
                knowledgeModal.classList.add('show');
            }

            /**
             * 渲染知识点树（左栏）
             *
             * 清空容器后遍历根节点数组，递归创建每个节点。
             */
            function renderKnowledgeTree() {
                var tree = config.getKnowledgeTree();
                knowledgeTreeContainer.innerHTML = '';
                tree.forEach(function (node) {
                    // level 0 表示根级，每深一层 +20px 缩进
                    knowledgeTreeContainer.appendChild(createKnowledgeNode(node, 0));
                });
            }

            /**
             * 递归创建单个知识点树节点
             *
             * @param {Object} node - 知识点节点对象 { id, name, children? }
             * @param {number} level - 当前层级深度（0 为根级）
             * @returns {HTMLElement} <li> 元素，包含完整的行内容和可能的子节点列表
             *
             * 每个节点的 DOM 结构：
             *   <li>
             *     <div.tree-main>
             *       <span.tree-arrow>          ← 展开/折叠箭头（无子节点时为空占位）
             *       <span.tree-text>           ← 知识点名称（点击可展开/折叠）
             *       <span.tree-check>          ← 勾选框
             *     </div>
             *     <ul.tree-children>          ← 子节点列表（仅在展开时显示）
             *       <li> ... </li>            ← 递归嵌套
             *     </ul>
             *   </li>
             *
             * 自动展开逻辑：如果子节点中任意一个已被选中，则自动展开当前节点。
             */
            function createKnowledgeNode(node, level) {
                var li = document.createElement('li');
                li.setAttribute('data-id', node.id);

                // 判断是否有子节点
                var hasChildren = node.children && node.children.length > 0;

                // 行容器
                var main = document.createElement('div');
                main.className = 'tree-main';
                // 左侧缩进：14px 基础 + 每层 20px
                // main.style.paddingLeft = (14 + level * 20) + 'px';

                // --- 展开折叠箭头 ---
                if (hasChildren) {
                    var arrow = document.createElement('span');
                    arrow.className = 'tree-arrow';
                    arrow.innerHTML = '<i class="fas fa-chevron-right"></i>';
                    arrow.addEventListener('click', function (e) {
                        e.stopPropagation();
                        // 切换箭头旋转状态
                        arrow.classList.toggle('expanded');
                        // 切换子节点列表的显示/隐藏
                        var children = li.querySelector('.tree-children');
                        if (children) children.classList.toggle('expanded');
                    });
                    main.appendChild(arrow);
                } else {
                    // 无子节点时放置一个等宽占位符，保持文字对齐
                    var spacer = document.createElement('span');
                    spacer.style.width = '20px';
                    spacer.style.display = 'inline-block';
                    spacer.style.flexShrink = '0';
                    main.appendChild(spacer);
                }

                // --- 知识点名称 ---
                var text = document.createElement('span');
                text.className = 'tree-text';
                text.textContent = node.name;
                // 点击文字也触发展开/折叠
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

                // --- 勾选框 ---
                var check = document.createElement('span');
                // 根据 ID 是否在临时选中列表中决定初始勾选状态
                check.className = 'tree-check' + (tempKnowledgeSelected.indexOf(node.id) !== -1 ? ' checked' : '');
                check.addEventListener('click', function (e) {
                    e.stopPropagation();
                    var idx = tempKnowledgeSelected.indexOf(node.id);
                    if (idx >= 0) {
                        // 取消勾选
                        tempKnowledgeSelected.splice(idx, 1);
                        this.classList.remove('checked');
                    } else {
                        // 勾选
                        tempKnowledgeSelected.push(node.id);
                        this.classList.add('checked');
                    }
                    // 刷新右栏已选中列表
                    renderKnowledgeSelectedList();
                });
                main.appendChild(check);

                // 点击行空白区域：展开/折叠
                main.addEventListener('click', function (e) {
                    // 如果点击的是勾选框，不处理（已有独立事件）
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

                // --- 子节点列表（递归创建） ---
                if (hasChildren) {
                    var childrenUl = document.createElement('ul');
                    childrenUl.className = 'tree-children';
                    node.children.forEach(function (child) {
                        childrenUl.appendChild(createKnowledgeNode(child, level + 1));
                    });
                    li.appendChild(childrenUl);

                    // 如果子节点中有任意一个被选中，自动展开当前节点
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
             * 渲染已选中知识点列表（右栏）
             *
             * 根据 tempKnowledgeSelected 中的 ID，从知识树中查找名称，
             * 展示在右栏中，每个条目有移除按钮可取消勾选。
             *
             * 和 renderKnowledgeTree 的勾选框联动：
             *   勾选框点击后会调用本函数刷新右栏。
             */
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

                    // 移除按钮：从临时选中列表删除，并刷新树和右栏
                    el.querySelector('.remove-btn').addEventListener('click', function (e) {
                        e.stopPropagation();
                        tempKnowledgeSelected = tempKnowledgeSelected.filter(function (k) { return k !== id; });
                        renderKnowledgeSelectedList();
                        renderKnowledgeTree();  // 需要刷新树以更新勾选框和自动折叠状态
                    });

                    knowledgeSelectedList.appendChild(el);
                });
            }

            /**
             * 确认知识点选择
             *
             * 将临时选中列表写回 tempFormKnowledge，刷新编辑弹窗知识点预览，
             * 关闭知识点弹窗并清除全局标志。
             */
            function confirmKnowledgeSelection() {
                window._abilityEditKnowledgeMode = false;
                tempFormKnowledge = tempKnowledgeSelected.slice();
                renderFormKnowledge();
                knowledgeModal.classList.remove('show');
            }

            /* ============================================================
             * 九、确认弹窗（confirm-modal）
             *
             * 通用确认提示弹窗，用于删除等需要用户二次确认的操作。
             * 支持传入任意文本和回调函数。
             *
             * targetMapTeacher.js 中的删除确认就是通过此弹窗实现的：
             *   abilityEditor.confirm('确认删除？', callback)
             * ============================================================ */

            /**
             * 显示确认弹窗
             *
             * @param {string} text - 提示文本（如「确认删除？」）
             * @param {Function} callback - 用户点击确认后执行的回调
             */
            function showConfirm(text, callback) {
                confirmText.textContent = text;
                confirmCallback = callback;
                confirmModal.classList.add('show');
            }

            /* ============================================================
             * 十、事件绑定
             *
             * 将所有弹窗的按钮、输入框等交互事件统一在此处绑定。
             *
             * 事件覆盖：
             *   - 关闭按钮 / 取消按钮 → 隐藏弹窗
             *   - 确认按钮 → 执行对应的确认逻辑
             *   - 输入框 → 实时搜索过滤
             *   - 新建标签 → 显示/隐藏输入表单
             * ============================================================ */

            // --- 编辑弹窗事件 ---
            createModalClose.addEventListener('click', function () { createModal.classList.remove('show'); });
            createBtnCancel.addEventListener('click', function () { createModal.classList.remove('show'); });
            createBtnConfirm.addEventListener('click', confirmEdit);

            // 「添加标签」和「添加知识点」按钮 → 打开对应弹窗
            addTagBtn.addEventListener('click', openTagModal);
            addKnowledgeBtn.addEventListener('click', openKnowledgeModal);

            // --- 标签选择弹窗事件 ---
            tagModalClose.addEventListener('click', function () { tagModal.classList.remove('show'); });
            tagBtnCancel.addEventListener('click', function () { tagModal.classList.remove('show'); });
            tagBtnConfirm.addEventListener('click', confirmTagSelection);

            // 「新建标签」按钮 → 显示输入表单
            newTagBtn.addEventListener('click', function () {
                tagNewForm.style.display = 'flex';
                newTagName.value = '';
                newTagName.focus();
            });
            // 「取消新建」按钮 → 隐藏输入表单
            newTagCancel.addEventListener('click', function () {
                tagNewForm.style.display = 'none';
            });
            // 「确认新建」按钮 → 校验并添加新标签
            newTagConfirm.addEventListener('click', function () {
                var name = newTagName.value.trim();
                // 校验：名称不能为空
                if (!name) {
                    alert('请输入标签名称');
                    newTagName.focus();
                    return;
                }
                // 校验：标签不能重复
                var tagsData = config.getTags();
                if (tagsData.indexOf(name) !== -1) {
                    alert('标签已存在');
                    newTagName.focus();
                    return;
                }
                // 添加并持久化
                tagsData.push(name);
                config.saveTags();
                tagNewForm.style.display = 'none';
                renderTagList();  // 刷新左栏列表
            });

            // 标签搜索输入框：实时过滤
            tagSearchInput.addEventListener('input', function () {
                renderTagList();
            });

            // --- 知识点选择弹窗事件 ---
            knowledgeModalClose.addEventListener('click', function () {
                // 关闭时清除全局标志，避免影响 targetMapTeacher.js 中的同名弹窗
                window._abilityEditKnowledgeMode = false;
                knowledgeModal.classList.remove('show');
            });
            knowledgeBtnCancel.addEventListener('click', function () {
                window._abilityEditKnowledgeMode = false;
                knowledgeModal.classList.remove('show');
            });
            knowledgeBtnConfirm.addEventListener('click', confirmKnowledgeSelection);

            // --- 确认提示弹窗事件 ---
            confirmModalClose.addEventListener('click', function () {
                confirmModal.classList.remove('show');
                confirmCallback = null;  // 关闭时清除回调
            });
            confirmBtnCancel.addEventListener('click', function () {
                confirmModal.classList.remove('show');
                confirmCallback = null;
            });
            confirmBtnConfirm.addEventListener('click', function () {
                confirmModal.classList.remove('show');
                // 如果有回调则执行，然后清除
                if (confirmCallback) confirmCallback();
                confirmCallback = null;
            });

            /* ============================================================
             * 十一、返回公开 API
             *
             * AbilityEdit 实例通过此对象对外暴露三个方法：
             *
             *   open(abilityId)   - 打开编辑弹窗，传入已有 ID 为编辑，null 为新建
             *   create()          - 快捷新建方法，等同于 open(null)
             *   confirm(text, fn) - 打开确认弹窗，传入提示文本和确认回调
             *
             * 注意：这些方法之所以是异步获取的，是因为构造函数返回了 async 函数。
             *       调用方必须使用 await new AbilityEdit(config) 来获取实例。
             * ============================================================ */

            return {
                /**
                 * 打开编辑弹窗
                 * @param {string|null} abilityId - 能力 ID，null 为新建模式
                 */
                open: function (abilityId) {
                    openEditModal(abilityId);
                },

                /**
                 * 快捷方法：以新建模式打开编辑弹窗
                 */
                create: function () {
                    openEditModal(null);
                },

                /**
                 * 打开通用确认弹窗（如删除确认）
                 * @param {string} text - 提示文本
                 * @param {Function} callback - 确认后执行的回调
                 */
                confirm: function (text, callback) {
                    showConfirm(text, callback);
                }
            };
        })();
    }

    // 将 AbilityEdit 构造函数暴露为全局变量
    return AbilityEdit;
})();
