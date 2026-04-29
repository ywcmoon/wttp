// 探索页面的核心功能
(function () {
    // 当前选中的卡片
    let selectedCards = new Set();

    // 当前活动的选项卡
    let currentTab = 'question';

    // 完整的层级数据
    let fullData = null;

    // 当前加载的卡片数据
    let blocksData = null;

    // 初始化
    document.addEventListener('DOMContentLoaded', function () {
        // initTabs();
        initCards();
        initButtons();
    });

    // // 初始化选项卡
    // function initTabs() {
    //     const tabItems = document.querySelectorAll('.tab-item');

    //     tabItems.forEach(tab => {
    //         tab.addEventListener('click', function() {
    //             const tabId = this.getAttribute('data-tab');

    //             if (tabId === 'question') {
    //                 // 跳转到问题图谱页面
    //                 window.location.href = 'index.html';
    //             } else if (tabId === 'ability') {
    //                 // 跳转到能力图谱页面
    //                 window.location.href = 'targetMapTeacher.html';
    //             }
    //         });
    //     });
    // }

    // 初始化卡片
    function initCards() {
        // 先尝试读取完整的层级数据
        const fullHierarchyData = localStorage.getItem('fullHierarchyData');

        let blocks = [];

        try {
            if (fullHierarchyData) {
                fullData = JSON.parse(fullHierarchyData);
                
                // 使用第一层级数据
                if (fullData && fullData.level1 && fullData.level1.length > 0) {
                    blocks = fullData.level1;
                }
            } else {
                // 如果没有完整数据，尝试读取 exploreBlocks
                const exploreBlocks = localStorage.getItem('exploreBlocks');
                if (exploreBlocks) {
                    blocks = JSON.parse(exploreBlocks);
                }
            }
            console.log(blocks)
        } catch (error) {
            console.error('数据解析失败:', error);
        }

        // 如果没有获取到数据，提示空数据
        if (blocks.length === 0) {
            alert('暂无数据，请先配置层级数据');
            return;
        }

        // 保存当前卡片数据
        blocksData = blocks;

        // 渲染两个选项卡的卡片
        renderCards('question', blocks);
        renderCards('ability', blocks);
    }

    // 渲染卡片
    function renderCards(tabId, blocks) {
        const container = document.getElementById(tabId + '-cards');

        container.innerHTML = '';

        // 获取探索进度
        const exploreProgress = JSON.parse(localStorage.getItem('exploreProgress') || '{}');

        blocks.forEach((block, index) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'explore-card-wrapper';

            const card = document.createElement('div');
            card.className = 'explore-card';
            card.setAttribute('data-id', block.id);

            // 构建进度显示 HTML
            let progressHTML = '';
            if (exploreProgress[block.id]) {
                const progress = exploreProgress[block.id];
                if (progress.isCompleted) {
                    progressHTML = '<span class="card-progress completed">已探索</span>';
                } else {
                    progressHTML = `<span class="card-progress progress">进度 ${progress.progress}%</span>`;
                }
            }

            card.innerHTML = `
                <div class="card-checkbox">
                    <i class="fas fa-check"></i>
                </div>
                <div class="card-content">
                    <h3 class="card-title">${block.title}</h3>
                    <p class="card-desc">${block.desc}</p>
                </div>
                ${progressHTML}
            `;

            // 绑定点击事件
            const checkbox = card.querySelector('.card-checkbox');

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

    // 切换卡片选中状态
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
        console.log(selectedCards.size);
        // 更新选中数量
        updateSelectedCount();
    }

    // 更新选中数量
    function updateSelectedCount() {
        const selectedCountElement = document.getElementById('selected-count');
        if (selectedCountElement) {
            selectedCountElement.textContent = selectedCards.size;
        }
    }

    // 初始化按钮
    function initButtons() {
        // 开始探索按钮
        document.getElementById('start-explore-question').addEventListener('click', function () {
            showModal();
        });

        document.getElementById('start-explore-ability').addEventListener('click', function () {
            showModal();
        });

        // 取消按钮
        document.getElementById('cancel-explore').addEventListener('click', function () {
            hideModal();
        });

        // 确认按钮
        document.getElementById('confirm-explore').addEventListener('click', function () {
            confirmExplore();
        });

        // 点击弹窗外部关闭
        document.getElementById('explore-modal').addEventListener('click', function (e) {
            if (e.target === this) {
                hideModal();
            }
        });
    }

    // 显示弹窗
    function showModal() {
        if (selectedCards.size === 0) {
            alert('请至少选择一个项目');
            return;
        }

        updateSelectedCount();
        document.getElementById('explore-modal').classList.add('show');
    }

    // 隐藏弹窗
    function hideModal() {
        document.getElementById('explore-modal').classList.remove('show');
    }

    // 确认开始探索
    function confirmExplore() {
        // 保存完整的层级数据到 localStorage
        if (fullData) {
            localStorage.setItem('fullHierarchyData', JSON.stringify(fullData));
        }

        // 保存选中的卡片信息到 ls2（通常是第一层级的一个或多个卡片id）
        const selectedData = Array.from(selectedCards);
        localStorage.setItem('ls2', JSON.stringify(selectedData));

        // 同时保存到原有的键名，保持兼容性
        localStorage.setItem('selectedExploreCards', JSON.stringify(selectedData));

        // 获取选中的卡片详情数据
        const selectedCardsDetail = blocksData.filter(block => selectedCards.has(block.id));
        localStorage.setItem('selectedCardsDetail', JSON.stringify(selectedCardsDetail));

        // 跳转到 goLink.html
        // window.location.href = 'goLink.html';
        window.open('goLink.html', '_blank');
    }

})();
