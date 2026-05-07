/* =============================================
   WhatsApp Chat Viewer — program.js
   Supports: TXT + ZIP, search, media/stickers
   ============================================= */

'use strict';

let parsedMessages = [];
let mediaFiles = {};
let users = [];
let userColors = {};
let currentPOV = null;
let currentTheme = 'dark';
let searchActive = false;

const USER_COLORS = ['#E06C60','#61AFEF','#56B6C2','#C678DD','#98C379','#E5C07B','#BE5046','#528BFF','#D19A66','#ABB2BF'];
let colorIndex = 0;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const SYSTEM_KEYWORDS = [
    'Messages and calls are end-to-end encrypted','left','You\'re no longer an admin','changed to','You removed','Your security code with','added','changed this group\'s icon','created group','You created group','was added','changed the group description','joined using this group\'s invite link','changed the subject','changed the group name','You\'re now an admin','started a call','missed voice call','missed video call','missed a call','This message was deleted','You deleted this message','null','deleted this message','changed their phone number','joined using an invite link','waiting for this message','disappearing messages turned off','disappearing messages turned on','turned on disappearing messages','turned off disappearing messages'
];

const IMAGE_EXT = /\.(jpg|jpeg|png|gif|webp|bmp|heic|heif)$/i;
const STICKER_EXT = /\.webp$/i;
const VIDEO_EXT = /\.(mp4|mov|avi|mkv|3gp)$/i;
const AUDIO_EXT = /\.(opus|mp3|ogg|wav|aac|m4a)$/i;
const FILE_ATTACHED_RE = /^(.+)\s\(file attached\)$/i;
const ATTACHED_RE = /^<attached:\s*(.+)>$/i;
const MEDIA_OMITTED_RE = /^<media omitted>$/i;

(function initTheme() {
    const saved = localStorage.getItem('wa-theme');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    currentTheme = saved || (prefersDark ? 'dark' : 'light');
    applyTheme(currentTheme);
})();

function applyTheme(theme) {
    currentTheme = theme;
    document.body.classList.toggle('light', theme === 'light');
    document.getElementById('theme-icon-dark').style.display = theme === 'dark' ? 'block' : 'none';
    document.getElementById('theme-icon-light').style.display = theme === 'light' ? 'block' : 'none';
    localStorage.setItem('wa-theme', theme);
}

function toggleTheme() {
    applyTheme(currentTheme === 'dark' ? 'light' : 'dark');
}

function openGuide() {
    document.getElementById('guide-overlay').style.display = 'block';
    document.getElementById('guide-modal').style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeGuide() {
    document.getElementById('guide-overlay').style.display = 'none';
    document.getElementById('guide-modal').style.display = 'none';
    document.body.style.overflow = '';
}

function switchGuideTab(btn, panel) {
    document.querySelectorAll('.guide-tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.guide-panel').forEach(p => {
        p.classList.remove('active');
        p.style.display = 'none';
    });
    btn.classList.add('active');
    const el = document.getElementById('guide-' + panel);
    el.classList.add('active');
    el.style.display = 'block';
}

let toastTimer = null;
function showToast(msg) {
    const t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 3000);
}

function handleDrop(e) {
    e.preventDefault();
    document.getElementById('drop-zone').classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
}

function handleDragOver(e) {
    e.preventDefault();
    document.getElementById('drop-zone').classList.add('drag-over');
}

function handleDragLeave() {
    document.getElementById('drop-zone').classList.remove('drag-over');
}

function handleFileInput(e) {
    const file = e.target.files[0];
    if (file) processFile(file);
}

function processFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'zip') {
        showToast('Reading ZIP file…');
        loadZip(file);
    } else if (ext === 'txt') {
        showToast('Reading chat file…');
        const reader = new FileReader();
        reader.onload = e => initChat(file.name, e.target.result, {});
        reader.readAsText(file, 'utf-8');
    } else {
        showToast('Please upload a .txt or .zip file.');
    }
}

function loadZip(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        JSZip.loadAsync(e.target.result).then(zip => {
            let chatTextPromise = null;
            let chatFileName = '';
            const mediaPromises = [];
            zip.forEach((relativePath, entry) => {
                if (entry.dir) return;
                const name = relativePath.split('/').pop();
                const ext = name.split('.').pop().toLowerCase();
                if ((ext === 'txt') && (name.toLowerCase().includes('chat') || !chatTextPromise)) {
                    chatTextPromise = entry.async('string');
                    chatFileName = name;
                } else {
                    mediaPromises.push(entry.async('blob').then(blob => {
                        const url = URL.createObjectURL(blob);
                        mediaFiles[name.toLowerCase()] = url;
                        mediaFiles[name] = url;
                    }));
                }
            });
            if (!chatTextPromise) {
                showToast('No chat .txt file found in ZIP.');
                return;
            }
            Promise.all([chatTextPromise, ...mediaPromises]).then(([text]) => {
                const fileCount = Object.keys(mediaFiles).length;
                showToast(`Loaded chat + ${fileCount} media file${fileCount !== 1 ? 's' : ''}`);
                initChat(chatFileName, text, mediaFiles);
            });
        }).catch(() => showToast('Failed to read ZIP file. Make sure it\'s a valid WhatsApp export.'));
    };
    reader.readAsArrayBuffer(file);
}

function initChat(filename, text, media) {
    mediaFiles = media || {};
    parsedMessages = [];
    users = [];
    userColors = {};
    colorIndex = 0;
    currentPOV = null;
    parseChat(text);
    if (parsedMessages.length === 0) {
        showToast('Could not parse any messages. Make sure it\'s a WhatsApp chat export.');
        return;
    }
    document.getElementById('upload-section').style.display = 'none';
    document.getElementById('privacy-banner').style.display = 'none';
    document.getElementById('chat-info').style.display = 'block';
    document.getElementById('chat-filename').textContent = filename;
    const msgCount = parsedMessages.filter(m => m.type === 'message').length;
    document.getElementById('chat-msgcount').textContent = msgCount.toLocaleString() + ' messages';
    const sel = document.getElementById('pov-select');
    sel.innerHTML = '';
    users.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u;
        opt.textContent = u;
        sel.appendChild(opt);
    });
    const usersList = document.getElementById('users-list');
    usersList.innerHTML = '';
    users.forEach(u => {
        const chip = document.createElement('div');
        chip.className = 'user-chip';
        const avatar = document.createElement('div');
        avatar.className = 'user-avatar';
        avatar.style.backgroundColor = userColors[u];
        avatar.textContent = u.charAt(0).toUpperCase();
        const name = document.createElement('span');
        name.textContent = u;
        chip.appendChild(avatar);
        chip.appendChild(name);
        usersList.appendChild(chip);
    });
    currentPOV = users[0] || null;
    document.getElementById('btn-reload').style.display = 'flex';
    document.getElementById('btn-search').style.display = 'flex';
    document.getElementById('search-bar').style.display = 'none';
    searchActive = false;
    renderMessages();
    document.getElementById('chat-area').style.display = 'block';
    showToast('Chat loaded successfully');
}

function parseChat(text) {
    const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    let currentMsg = null;
    rawLines.forEach(line => {
        if (!line.trim()) return;
        const parsed = tryParseLine(line);
        if (parsed) {
            if (currentMsg) parsedMessages.push(currentMsg);
            currentMsg = parsed;
        } else if (currentMsg) {
            currentMsg.text += '\n' + line;
        }
    });
    if (currentMsg) parsedMessages.push(currentMsg);
}

function tryParseLine(line) {
    const iosRe = /^\[(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2}:\d{2}(?::\d{2})?)\s*([AP]M)?\]\s(.+?):\s([\s\S]*)$/;
    const iosMatch = line.match(iosRe);
    if (iosMatch) {
        const [, p1, p2, yearRaw, time, ampm, user, text] = iosMatch;
        const { dateKey, dateDisplay } = resolveDate(p1, p2, yearRaw);
        const timeStr = ampm ? time + ' ' + ampm : time;
        return makeMsg(dateKey, dateDisplay, timeStr, user.trim(), text);
    }
    const a12Re = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2}:\d{2})\s([AP]M)\s[-–]\s(.+?):\s([\s\S]*)$/;
    const a12Match = line.match(a12Re);
    if (a12Match) {
        const [, p1, p2, yearRaw, time, ampm, user, text] = a12Match;
        const { dateKey, dateDisplay } = resolveDate(p1, p2, yearRaw);
        return makeMsg(dateKey, dateDisplay, time + ' ' + ampm, user.trim(), text);
    }
    const a24Re = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2}:\d{2})\s[-–]\s(.+?):\s([\s\S]*)$/;
    const a24Match = line.match(a24Re);
    if (a24Match) {
        const [, p1, p2, yearRaw, time, user, text] = a24Match;
        const { dateKey, dateDisplay } = resolveDate(p1, p2, yearRaw);
        return makeMsg(dateKey, dateDisplay, time, user.trim(), text);
    }
    const sysRe = /^(?:\[)?(\d{1,2})\/(\d{1,2})\/(\d{2,4}),\s(\d{1,2}:\d{2}(?::\d{2})?)\s*[AP]?M?\s*[\]:\s-–]+\s*(.+)$/;
    const sysMatch = line.match(sysRe);
    if (sysMatch) {
        const [, p1, p2, yearRaw, time, rest] = sysMatch;
        if (isSystemMessage(rest)) {
            const { dateKey, dateDisplay } = resolveDate(p1, p2, yearRaw);
            return { type: 'system', dateKey, dateDisplay, time, text: rest.trim() };
        }
    }
    return null;
}

function resolveDate(p1, p2, yearRaw) {
    let year = parseInt(yearRaw);
    if (year < 100) year += 2000;
    let day, month;
    const n1 = parseInt(p1), n2 = parseInt(p2);
    if (n1 > 12) {
        day = n1; month = n2;
    } else if (n2 > 12) {
        day = n2; month = n1;
    } else {
        day = n1; month = n2;
    }
    const dateKey = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
    const dateDisplay = `${MONTHS[month-1]} ${day}, ${year}`;
    return { dateKey, dateDisplay };
}

function makeMsg(dateKey, dateDisplay, time, user, text) {
    if (!users.includes(user)) {
        users.push(user);
        userColors[user] = USER_COLORS[colorIndex % USER_COLORS.length];
        colorIndex++;
    }
    return { type: 'message', dateKey, dateDisplay, time, user, text: text.trim() };
}

function isSystemMessage(text) {
    const lower = text.toLowerCase();
    return SYSTEM_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

function renderMessages() {
    const container = document.getElementById('messages-container');
    container.innerHTML = '';
    let lastDateKey = null;
    let lastUser = null;
    parsedMessages.forEach((msg, idx) => {
        if (msg.type === 'system') {
            if (msg.dateKey !== lastDateKey) {
                container.appendChild(makeDateChip(msg.dateDisplay, msg.dateKey));
                lastDateKey = msg.dateKey;
                lastUser = null;
            }
            const row = document.createElement('div');
            row.className = 'system-row';
            const bubble = document.createElement('div');
            bubble.className = 'system-msg';
            bubble.textContent = msg.text;
            row.appendChild(bubble);
            container.appendChild(row);
            return;
        }
        if (msg.dateKey !== lastDateKey) {
            container.appendChild(makeDateChip(msg.dateDisplay, msg.dateKey));
            lastDateKey = msg.dateKey;
            lastUser = null;
        }
        const isOut = msg.user === currentPOV;
        const row = document.createElement('div');
        row.className = 'msg-row ' + (isOut ? 'outgoing' : 'incoming');
        row.dataset.user = msg.user;
        row.dataset.text = msg.text.toLowerCase();
        row.dataset.date = msg.dateKey;
        row.dataset.idx = idx;
        const bubble = document.createElement('div');
        bubble.className = 'bubble';
        if (!isOut && msg.user !== lastUser) {
            const senderEl = document.createElement('div');
            senderEl.className = 'bubble-sender';
            senderEl.textContent = msg.user;
            senderEl.style.color = userColors[msg.user] || '#8696A0';
            bubble.appendChild(senderEl);
        }
        bubble.appendChild(renderMessageBody(msg.text));
        const timeEl = document.createElement('div');
        timeEl.className = 'bubble-time';
        timeEl.textContent = msg.time;
        bubble.appendChild(timeEl);
        row.appendChild(bubble);
        container.appendChild(row);
        lastUser = msg.user;
    });
}

function makeDateChip(display, dateKey) {
    const row = document.createElement('div');
    row.className = 'date-chip-row';
    row.dataset.datekey = dateKey;
    const chip = document.createElement('div');
    chip.className = 'date-chip';
    chip.textContent = display;
    row.appendChild(chip);
    return row;
}

function renderMessageBody(text) {
    const wrapper = document.createElement('div');
    if (MEDIA_OMITTED_RE.test(text.trim())) {
        const el = document.createElement('div');
        el.className = 'media-omitted';
        el.textContent = '🖼 Media omitted';
        wrapper.appendChild(el);
        return wrapper;
    }
    const attachedMatch = text.trim().match(FILE_ATTACHED_RE);
    const iosAttachedMatch = text.trim().match(ATTACHED_RE);
    const mediaFilename = attachedMatch ? attachedMatch[1].trim() : (iosAttachedMatch ? iosAttachedMatch[1].trim() : null);
    if (mediaFilename) {
        wrapper.appendChild(renderMedia(mediaFilename));
        return wrapper;
    }
    const textEl = document.createElement('div');
    textEl.className = 'bubble-text';
    textEl.innerHTML = linkify(escapeHTML(text));
    wrapper.appendChild(textEl);
    return wrapper;
}

function renderMedia(filename) {
    const wrapper = document.createElement('div');
    const key = filename.toLowerCase();
    const url = mediaFiles[key] || mediaFiles[filename] || null;
    if (!url) {
        const el = document.createElement('div');
        el.className = 'media-omitted';
        el.textContent = '📎 ' + filename;
        wrapper.appendChild(el);
        return wrapper;
    }
    const isSticker = STICKER_EXT.test(filename);
    const isImage = IMAGE_EXT.test(filename) || isSticker;
    const isVideo = VIDEO_EXT.test(filename);
    const isAudio = AUDIO_EXT.test(filename);
    const mediaDiv = document.createElement('div');
    mediaDiv.className = 'bubble-media';
    if (isImage) {
        const img = document.createElement('img');
        img.src = url;
        img.alt = filename;
        if (isSticker) img.className = 'sticker';
        img.loading = 'lazy';
        img.onclick = () => openLightbox(url);
        mediaDiv.appendChild(img);
    } else if (isVideo) {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.preload = 'metadata';
        mediaDiv.appendChild(video);
    } else if (isAudio) {
        const audio = document.createElement('audio');
        audio.src = url;
        audio.controls = true;
        mediaDiv.appendChild(audio);
    } else {
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.className = 'media-file-link';
        a.innerHTML = `<svg viewBox="0 0 24 24"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11zm-3-7H9v2h6v-2zm-6-3v2h6v-2H9z"/></svg>${filename}`;
        mediaDiv.appendChild(a);
    }
    wrapper.appendChild(mediaDiv);
    return wrapper;
}

function changePOV(sel) {
    currentPOV = sel.value;
    renderMessages();
}

function toggleSearch() {
    searchActive = !searchActive;
    const bar = document.getElementById('search-bar');
    bar.style.display = searchActive ? 'block' : 'none';
    if (searchActive) document.getElementById('search-input').focus();
    else clearSearch();
}

function closeSearch() {
    searchActive = false;
    document.getElementById('search-bar').style.display = 'none';
    clearSearch();
}

function clearSearch() {
    document.getElementById('search-input').value = '';
    document.getElementById('search-date').value = '';
    document.getElementById('search-results-info').textContent = '';
    showAllMessages();
}

function showAllMessages() {
    document.querySelectorAll('.msg-row').forEach(r => {
        r.classList.remove('search-hidden', 'search-highlight');
    });
    document.querySelectorAll('.date-chip-row').forEach(r => r.style.display = '');
    document.getElementById('no-results').style.display = 'none';
    document.getElementById('messages-container').style.display = '';
}

function searchMessages(query) {
    const dateFilter = document.getElementById('search-date').value;
    applyFilters(query.trim().toLowerCase(), dateFilter);
}

function filterByDate(dateVal) {
    const query = document.getElementById('search-input').value.trim().toLowerCase();
    if (dateVal) {
        const targetRow = document.querySelector(`.date-chip-row[data-datekey="${dateVal}"]`);
        if (targetRow) {
            targetRow.scrollIntoView({ behavior: 'smooth', block: 'start' });
            document.getElementById('search-results-info').textContent = 'Jumped to ' + formatDateKey(dateVal);
            return;
        } else {
            document.getElementById('search-results-info').textContent = 'No messages on this date';
        }
    }
    applyFilters(query, dateVal);
}

function formatDateKey(dateKey) {
    const [year, month, day] = dateKey.split('-').map(Number);
    return `${MONTHS[month-1]} ${day}, ${year}`;
}

function applyFilters(query, dateFilter) {
    if (!query && !dateFilter) {
        showAllMessages();
        return;
    }
    let visible = 0;
    const rows = document.querySelectorAll('.msg-row');
    rows.forEach(row => {
        const text = row.dataset.text || '';
        const user = (row.dataset.user || '').toLowerCase();
        const date = row.dataset.date || '';
        const matchesText = !query || text.includes(query) || user.includes(query);
        const matchesDate = !dateFilter || date === dateFilter;
        if (matchesText && matchesDate) {
            row.classList.remove('search-hidden');
            row.classList.toggle('search-highlight', !!query);
            visible++;
        } else {
            row.classList.add('search-hidden');
            row.classList.remove('search-highlight');
        }
    });
    document.querySelectorAll('.date-chip-row').forEach(chipRow => {
        const dateKey = chipRow.dataset.datekey;
        const hasVisible = document.querySelector(`.msg-row:not(.search-hidden)[data-date="${dateKey}"]`);
        chipRow.style.display = hasVisible ? '' : 'none';
    });
    const noResults = document.getElementById('no-results');
    const container = document.getElementById('messages-container');
    if (visible === 0) {
        noResults.style.display = 'flex';
        container.style.display = 'none';
    } else {
        noResults.style.display = 'none';
        container.style.display = '';
    }
    document.getElementById('search-results-info').textContent = visible === 0 ? 'No messages found' : `${visible} message${visible !== 1 ? 's' : ''} found`;
    if (visible > 0) {
        const first = document.querySelector('.msg-row:not(.search-hidden)');
        if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
}

function openLightbox(src) {
    let lb = document.getElementById('lightbox');
    if (!lb) {
        lb = document.createElement('div');
        lb.id = 'lightbox';
        lb.onclick = closeLightbox;
        const img = document.createElement('img');
        lb.appendChild(img);
        const closeBtn = document.createElement('button');
        closeBtn.id = 'lightbox-close';
        closeBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>';
        closeBtn.onclick = closeLightbox;
        lb.appendChild(closeBtn);
        document.body.appendChild(lb);
    }
    lb.querySelector('img').src = src;
    lb.style.display = 'flex';
    document.body.style.overflow = 'hidden';
}

function closeLightbox() {
    const lb = document.getElementById('lightbox');
    if (lb) lb.style.display = 'none';
    document.body.style.overflow = '';
}

function escapeHTML(str) {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');
}

function linkify(text) {
    const urlRe = /(https?:\/\/[^\s<>"]+)/g;
    return text.replace(urlRe, '<a href="$1" target="_blank" rel="noopener noreferrer" style="color:inherit;opacity:0.85">$1</a>');
}
