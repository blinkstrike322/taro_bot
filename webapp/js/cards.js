var dailyCards = [];
var selectedCardIndex = -1;

function initDailyCards() {
    dailyCards = [0, 1, 2];
    selectedCardIndex = -1;

    var cardElements = document.querySelectorAll('.card-back');
    cardElements.forEach(function(card, index) {
        card.classList.remove('flipped', 'selected', 'glow');
        card.style.opacity = '1';
        card.style.transform = '';
        card.style.transition = '';

        startTremble(card);
        card.onclick = function() {
            selectCard(index);
        };
    });
}

function startTremble(element) {
    var tremble = function() {
        if (element.classList.contains('flipped')) return;
        var x = (Math.random() - 0.5) * 2;
        var y = (Math.random() - 0.5) * 2;
        element.style.transform = 'translate(' + x + 'px, ' + y + 'px)';
        setTimeout(tremble, 100 + Math.random() * 200);
    };
    tremble();
}

function selectCard(index) {
    if (selectedCardIndex !== -1) return;
    selectedCardIndex = index;

    var cards = document.querySelectorAll('.card-back');

    cards.forEach(function(card, i) {
        if (i !== index) {
            card.style.transition = 'opacity 0.5s, transform 0.5s';
            card.style.opacity = '0';
            card.style.transform = 'scale(0.8)';
        }
    });

    setTimeout(function() {
        var selected = cards[index];
        selected.classList.add('flipped');

        setTimeout(function() {
            selected.classList.add('glow');
        }, 600);

        setTimeout(function() {
            if (window.Telegram?.WebApp) {
                Telegram.WebApp.sendData(JSON.stringify({
                    action: 'card_picked',
                    card_index: index
                }));
            }
        }, 800);
    }, 400);
}

function initStars() {
    var container = document.getElementById('stars-container');
    if (!container) return;
    for (var i = 0; i < 50; i++) {
        var star = document.createElement('div');
        star.className = 'star';
        star.style.left = Math.random() * 100 + '%';
        star.style.top = Math.random() * 100 + '%';
        star.style.animationDelay = Math.random() * 3 + 's';
        container.appendChild(star);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    initStars();
    var initData = window.getInitData ? window.getInitData() : {};
    if (initData.skip_character) {
        window.showScreen('screen-daily');
        initDailyCards();
    }
});

window.initDailyCards = initDailyCards;
