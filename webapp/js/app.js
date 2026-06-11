var tg = window.Telegram?.WebApp;
if (tg) {
    tg.ready();
    tg.expand();
}

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(function(s) {
        s.classList.remove('active');
    });
    var target = document.getElementById(screenId);
    if (target) {
        target.classList.add('active');
    }
}

function getInitData() {
    if (!tg) return {};
    try {
        return JSON.parse(tg.initDataUnsafe?.start_param || '{}');
    } catch (e) {
        return {};
    }
}

document.addEventListener('DOMContentLoaded', function() {
    var characterBtns = document.querySelectorAll('.character-card');
    characterBtns.forEach(function(btn) {
        btn.addEventListener('click', function() {
            showScreen('screen-daily');
            initDailyCards();
        });
    });
});

window.showScreen = showScreen;
window.getInitData = getInitData;
