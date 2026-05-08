/**
 * exploreList.js - 探索列表页面核心脚本
 * 
 * 功能说明：
 *   1. 从 localStorage 加载层级数据，渲染第一层级卡片列表
 *   2. 支持卡片多选（勾选/取消勾选）
 *   3. 显示每个卡片的探索进度（已探索 / 进度百分比）
 *   4. 确认选择后跳转到 goLink.html 开始探索
 * 
 * 数据流：
 *   fullHierarchyData / exploreBlocks → 卡片列表渲染 → 用户多选 → ls2 存储选中ID → 跳转 goLink.html
 * 
 * 依赖：
 *   - common.js（StorageManager）
 *   - Font Awesome（图标）
 */
(function () {
    'use strict';

    // ==================== 状态变量 ====================

    /** @type {Set<string>} 当前用户选中的卡片 ID 集合 */
    var selectedCards = new Set();

    /** @type {string} 当前活动的选项卡标识（'question' | 'ability'） */
    var currentTab = 'question';

    /** @type {Object|null} 从 localStorage 加载的完整层级数据 */
    var fullData = null;

    /** @type {Array|null} 当前页面加载的卡片数据（第一层级） */
    var blocksData = null;

    // ==================== 页面初始化 ====================

    /**
     * DOMContentLoaded 事件回调
     * 页面加载完成后初始化卡片列表和按钮事件
     */
    document.addEventListener('DOMContentLoaded', function () {
        initCards();
        initButtons();
    });

    // ==================== 卡片初始化与渲染 ====================

    /**
     * 初始化卡片列表
     * 
     * 数据加载优先级：
     *   1. 优先从 fullHierarchyData 中读取 level1 数据
     *   2. 如果不存在，则尝试从 exploreBlocks 读取
     *   3. 如果都没有数据，弹出提示
     * 
     * 加载完成后同时渲染"问题图谱"和"能力图谱"两个选项卡的卡片
     */
    function initCards() {
        fullData = StorageManager.get('fullHierarchyData', null);

        var blocks = [];

        if (fullData && fullData.level1 && fullData.level1.length > 0) {
            blocks = fullData.level1;
        } else {
            var exploreBlocks = StorageManager.get('exploreBlocks', null);
            if (exploreBlocks) {
                blocks = exploreBlocks;
            }
        }

        if (blocks.length === 0) {
            alert('暂无数据，请先配置层级数据');
            return;
        }

        blocksData = blocks;

        renderCards('question', blocks);
        renderCards('ability', blocks);
    }

    /**
     * 渲染指定选项卡的卡片列表
     * 
     * @param {string} tabId - 选项卡标识（'question' | 'ability'），对应 DOM 容器 ID
     * @param {Array} blocks - 要渲染的卡片数据数组
     * 
     * 每张卡片包含：
     *   - 勾选框（多选交互）
     *   - 标题和描述文本
     *   - 探索进度标签（已探索 / 进度 N%）
     * 
     * 交互行为：
     *   - 点击勾选框或卡片本身 → 切换选中状态
     *   - 选中后卡片高亮，勾选框显示对勾图标
     */
    function renderCards(tabId, blocks) {
        var container = document.getElementById(tabId + '-cards');
        container.innerHTML = '';

        var exploreProgress = StorageManager.get('exploreProgress', {});

        blocks.forEach(function (block, index) {
            var wrapper = document.createElement('div');
            wrapper.className = 'explore-card-wrapper';

            var card = document.createElement('div');
            card.className = 'explore-card';
            card.setAttribute('data-id', block.id);

            var progressHTML = '';
            if (exploreProgress[block.id]) {
                var progress = exploreProgress[block.id];
                if (progress.isCompleted) {
                    progressHTML = '<span class="card-progress completed">已探索</span>';
                } else {
                    progressHTML = '<span class="card-progress progress">进度 ' + progress.progress + '%</span>';
                }
            }

            card.innerHTML =
                '<div class="card-checkbox">' +
                    '<i class="fas fa-check"></i>' +
                '</div>' +
                '<div class="card-content">' +
                    '<h3 class="card-title">' + block.title + '</h3>' +
                    '<p class="card-desc">' + block.desc + '</p>' +
                '</div>' +
                progressHTML;

            var checkbox = card.querySelector('.card-checkbox');

            checkbox.addEventListener('click', function (e) {
                e.stopPropagation();
                toggleCard(block.id, card, this);
            });

            card.addEventListener('click', function () {
                toggleCard(block.id, card, checkbox);
            });

            wrapper.appendChild(card);
            container.appendChild(wrapper);
        });
    }

    // ==================== 卡片选中交互 ====================

    /**
     * 切换卡片的选中状态
     * 
     * @param {string} id - 卡片 ID
     * @param {HTMLElement} card - 卡片 DOM 元素
     * @param {HTMLElement} checkbox - 勾选框 DOM 元素
     * 
     * 行为：
     *   - 已选中 → 取消选中：从 Set 中移除，移除 CSS 高亮类
     *   - 未选中 → 选中：加入 Set，添加 CSS 高亮类
     *   - 每次切换后更新底部选中计数
     */
    function toggleCard(id, card, checkbox) {
        if (selectedCards.has(id)) {
            selectedCards.delete(id);
            card.classList.remove('selected');
            checkbox.classList.remove('checked');
        } else {
            selectedCards.add(id);
            card.classList.add('selected');
            checkbox.classList.add('checked');
        }

        updateSelectedCount();
    }

    /**
     * 更新底部选中数量显示
     * 将 selectedCards.size 写入 #selected-count 元素
     */
    function updateSelectedCount() {
        var selectedCountElement = document.getElementById('selected-count');
        if (selectedCountElement) {
            selectedCountElement.textContent = selectedCards.size;
        }
    }

    // ==================== 按钮事件 ====================

    /**
     * 初始化所有按钮的事件监听
     * 
     * 按钮列表：
     *   - #start-explore-question / #start-explore-ability：开始探索按钮
     *   - #cancel-explore：取消按钮（关闭弹窗）
     *   - #confirm-explore：确认按钮（保存数据并跳转）
     *   - #explore-modal 背景点击：关闭弹窗
     */
    function initButtons() {
        document.getElementById('start-explore-question').addEventListener('click', function () {
            showModal();
        });

        document.getElementById('start-explore-ability').addEventListener('click', function () {
            showModal();
        });

        document.getElementById('cancel-explore').addEventListener('click', function () {
            hideModal();
        });

        document.getElementById('confirm-explore').addEventListener('click', function () {
            confirmExplore();
        });

        document.getElementById('explore-modal').addEventListener('click', function (e) {
            if (e.target === this) {
                hideModal();
            }
        });
    }

    // ==================== 弹窗控制 ====================

    /**
     * 显示确认弹窗
     * 
     * 前置条件：
     *   - 至少选中一个项目，否则弹出提示
     * 
     * 弹窗内容：
     *   - 显示已选中的卡片数量
     *   - 提供"取消"和"确认"两个操作按钮
     */
    function showModal() {
        if (selectedCards.size === 0) {
            alert('请至少选择一个项目');
            return;
        }

        updateSelectedCount();
        document.getElementById('explore-modal').classList.add('show');
    }

    /**
     * 隐藏确认弹窗
     * 移除 .show 类使弹窗消失
     */
    function hideModal() {
        document.getElementById('explore-modal').classList.remove('show');
    }

    // ==================== 探索确认与跳转 ====================

    /**
     * 确认开始探索
     * 
     * 执行步骤：
     *   1. 将完整层级数据保存到 localStorage（fullHierarchyData）
     *   2. 将选中的卡片 ID 数组保存到 ls2
     *   3. 同时保存到 selectedExploreCards（兼容旧键名）
     *   4. 保存选中卡片的详情数据到 selectedCardsDetail
     *   5. 在新窗口打开 goLink.html 开始探索
     */
    function confirmExplore() {
        if (fullData) {
            StorageManager.set('fullHierarchyData', fullData);
        }

        var selectedData = Array.from(selectedCards);
        StorageManager.set('ls2', selectedData);
        StorageManager.set('selectedExploreCards', selectedData);

        var selectedCardsDetail = blocksData.filter(function (block) {
            return selectedCards.has(block.id);
        });
        StorageManager.set('selectedCardsDetail', selectedCardsDetail);

        window.open('goLink.html', '_blank');
    }

})();
