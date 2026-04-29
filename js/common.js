(function () {
 
    // 初始化
    document.addEventListener('DOMContentLoaded', function() {
        initTabs(); 
    });

    // 初始化选项卡
    function initTabs() {
        const tabItems = document.querySelectorAll('.tab-item');

        tabItems.forEach(tab => {
            tab.addEventListener('click', function () {
                const tabId = this.getAttribute('data-tab');

                if (tabId === 'question') {
                    // 跳转到问题图谱页面
                    window.location.href = 'index.html';
                } else if (tabId === 'ability') {
                    // 跳转到能力图谱页面
                    window.location.href = 'targetMapTeacher.html';
                }
            });
        });
    }

})();
