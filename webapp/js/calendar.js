let currentMonth = new Date().getMonth();
let currentYear = new Date().getFullYear();
let readingsData = {};

function renderCalendar() {
    const grid = document.getElementById('calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';
    
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    const startDay = firstDay === 0 ? 6 : firstDay - 1; // Monday start
    
    const monthNames = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                         'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
    const header = document.getElementById('calendar-month-year');
    if (header) header.textContent = `${monthNames[currentMonth]} ${currentYear}`;
    
    for (let i = 0; i < startDay; i++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day empty';
        grid.appendChild(cell);
    }
    
    for (let d = 1; d <= daysInMonth; d++) {
        const cell = document.createElement('div');
        cell.className = 'calendar-day';
        cell.textContent = d;
        
        const dateStr = `${currentYear}-${String(currentMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        if (readingsData[dateStr]) {
            cell.classList.add('has-reading');
            cell.addEventListener('click', () => showReadingForDate(dateStr));
        }
        grid.appendChild(cell);
    }
}

function showReadingForDate(dateStr) {
    const reading = readingsData[dateStr];
    if (!reading) return;
    const overlay = document.getElementById('reading-overlay');
    if (overlay) {
        overlay.querySelector('.reading-card-name').textContent = reading.card_name || '';
        overlay.querySelector('.reading-interpretation').textContent = reading.interpretation || '';
        overlay.classList.add('active');
    }
}

function prevMonth() {
    currentMonth--;
    if (currentMonth < 0) { currentMonth = 11; currentYear--; }
    renderCalendar();
}

function nextMonth() {
    currentMonth++;
    if (currentMonth > 11) { currentMonth = 0; currentYear++; }
    renderCalendar();
}

document.addEventListener('DOMContentLoaded', () => {
    const prevBtn = document.getElementById('cal-prev');
    const nextBtn = document.getElementById('cal-next');
    if (prevBtn) prevBtn.addEventListener('click', prevMonth);
    if (nextBtn) nextBtn.addEventListener('click', nextMonth);
    renderCalendar();
});
