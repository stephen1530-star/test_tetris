const COLS = 10;
const ROWS = 20;
const DROP_TICK = 50;
const SCORE_TABLE = [0, 100, 300, 500, 800];

const PIECES = {
  I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  O: [[1, 1], [1, 1]],
  T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
};
const PIECE_TYPES = Object.keys(PIECES);

const boardElement = document.querySelector('#board');
const holdPreview = document.querySelector('#hold-preview');
const nextList = document.querySelector('#next-list');
const overlay = document.querySelector('#screen-overlay');
const overlayIcon = document.querySelector('#overlay-icon');
const overlayEyebrow = document.querySelector('#overlay-eyebrow');
const overlayTitle = document.querySelector('#overlay-title');
const overlayMessage = document.querySelector('#overlay-message');
const overlayAction = document.querySelector('#overlay-action');
const overlayHint = document.querySelector('#overlay-hint');
const resultStats = document.querySelector('#result-stats');
const statusLabel = document.querySelector('#status-label');
const headerPause = document.querySelector('#header-pause');
const headerPauseIcon = document.querySelector('#header-pause-icon');
const scoreElement = document.querySelector('#score');
const levelElement = document.querySelector('#level');
const linesElement = document.querySelector('#lines');
const bestScoreElement = document.querySelector('#best-score');

let board = createEmptyBoard();
let current = null;
let nextQueue = [];
let holdType = null;
let holdUsed = false;
let score = 0;
let lines = 0;
let level = 1;
let status = 'ready';
let bag = [];
let lastDropAt = 0;
let animationFrame;
let bestScore = Number(localStorage.getItem('tetris-best-score') || 0);
const cells = [];

function createEmptyBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

function cloneMatrix(matrix) {
  return matrix.map((row) => [...row]);
}

function createCells() {
  boardElement.innerHTML = '';
  for (let index = 0; index < COLS * ROWS; index += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    cell.setAttribute('role', 'gridcell');
    cells.push(cell);
    boardElement.appendChild(cell);
  }
}

function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [result[index], result[randomIndex]] = [result[randomIndex], result[index]];
  }
  return result;
}

function getNextType() {
  if (bag.length === 0) bag = shuffle(PIECE_TYPES);
  return bag.pop();
}

function refillQueue() {
  while (nextQueue.length < 5) nextQueue.push(getNextType());
}

function makePiece(type) {
  const matrix = cloneMatrix(PIECES[type]);
  return {
    type,
    matrix,
    x: Math.floor((COLS - matrix[0].length) / 2),
    y: 0,
  };
}

function spawnPiece(type = null) {
  refillQueue();
  current = makePiece(type || nextQueue.shift());
  refillQueue();
  holdUsed = false;
  if (collides(current, 0, 0, current.matrix)) {
    endGame();
  }
}

function collides(piece, offsetX = 0, offsetY = 0, matrix = piece.matrix) {
  for (let row = 0; row < matrix.length; row += 1) {
    for (let column = 0; column < matrix[row].length; column += 1) {
      if (!matrix[row][column]) continue;
      const x = piece.x + column + offsetX;
      const y = piece.y + row + offsetY;
      if (x < 0 || x >= COLS || y >= ROWS) return true;
      if (y >= 0 && board[y][x]) return true;
    }
  }
  return false;
}

function movePiece(deltaX, deltaY) {
  if (status !== 'playing' || !current || collides(current, deltaX, deltaY)) return false;
  current.x += deltaX;
  current.y += deltaY;
  render();
  return true;
}

function softDrop() {
  if (movePiece(0, 1)) {
    score += 1;
    updateStats();
  } else {
    lockPiece();
  }
}

function hardDrop() {
  if (status !== 'playing' || !current) return;
  let distance = 0;
  while (movePiece(0, 1)) distance += 1;
  if (distance > 0) {
    score += distance * 2;
    updateStats();
  }
  lockPiece();
}

function rotateMatrix(matrix, clockwise = true) {
  const rotated = matrix[0].map((_, column) => matrix.map((row) => row[column]));
  return clockwise ? rotated.map((row) => row.reverse()) : rotated.reverse();
}

function rotatePiece(clockwise = true) {
  if (status !== 'playing' || !current || current.type === 'O') return;
  const rotated = rotateMatrix(current.matrix, clockwise);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collides(current, kick, 0, rotated)) {
      current.matrix = rotated;
      current.x += kick;
      render();
      return;
    }
  }
}

function lockPiece() {
  if (status !== 'playing' || !current) return;
  for (let row = 0; row < current.matrix.length; row += 1) {
    for (let column = 0; column < current.matrix[row].length; column += 1) {
      if (!current.matrix[row][column]) continue;
      const x = current.x + column;
      const y = current.y + row;
      if (y < 0) {
        endGame();
        return;
      }
      board[y][x] = current.type;
    }
  }
  clearLines();
  spawnPiece();
  lastDropAt = performance.now();
  render();
}

function clearLines() {
  const remaining = board.filter((row) => row.some((cell) => !cell));
  const cleared = ROWS - remaining.length;
  if (!cleared) return;
  board = [...Array.from({ length: cleared }, () => Array(COLS).fill(null)), ...remaining];
  score += SCORE_TABLE[cleared] * level;
  lines += cleared;
  level = Math.floor(lines / 10) + 1;
  updateStats();
}

function holdPiece() {
  if (status !== 'playing' || !current || holdUsed) return;
  const previousType = current.type;
  holdType = holdType ? holdType : null;
  if (holdType) {
    const swapType = holdType;
    holdType = previousType;
    current = makePiece(swapType);
    if (collides(current)) endGame();
  } else {
    holdType = previousType;
    spawnPiece();
  }
  holdUsed = true;
  render();
}

function getDropDistance() {
  if (!current) return 0;
  let distance = 0;
  while (!collides(current, 0, distance + 1)) distance += 1;
  return distance;
}

function render() {
  const visible = board.map((row) => [...row]);
  const ghostDistance = current && status === 'playing' ? getDropDistance() : 0;
  if (current && status !== 'over') {
    if (ghostDistance > 0) {
      for (let row = 0; row < current.matrix.length; row += 1) {
        for (let column = 0; column < current.matrix[row].length; column += 1) {
          if (!current.matrix[row][column]) continue;
          const x = current.x + column;
          const y = current.y + row + ghostDistance;
          if (y >= 0 && y < ROWS && !visible[y][x]) visible[y][x] = `ghost:${current.type}`;
        }
      }
    }
    for (let row = 0; row < current.matrix.length; row += 1) {
      for (let column = 0; column < current.matrix[row].length; column += 1) {
        if (!current.matrix[row][column]) continue;
        const x = current.x + column;
        const y = current.y + row;
        if (y >= 0 && y < ROWS) visible[y][x] = current.type;
      }
    }
  }
  visible.forEach((row, rowIndex) => row.forEach((type, columnIndex) => {
    const cell = cells[rowIndex * COLS + columnIndex];
    cell.className = 'cell';
    if (!type) return;
    if (type.startsWith('ghost:')) {
      cell.classList.add('ghost', `color-${type.slice(6)}`);
    } else {
      cell.classList.add('filled', `color-${type}`);
    }
  }));
  renderMiniBoard(holdPreview, holdType, false);
  nextList.innerHTML = '';
  nextQueue.slice(0, 3).forEach((type) => {
    const item = document.createElement('div');
    item.className = 'next-item';
    renderMiniBoard(item, type, true);
    nextList.appendChild(item);
  });
  updateStatusDisplay();
}

function renderMiniBoard(container, type, compact) {
  container.innerHTML = '';
  const matrix = type ? PIECES[type] : [];
  const width = compact ? 4 : 4;
  const height = 4;
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const miniCell = document.createElement('div');
      miniCell.className = 'mini-cell';
      if (matrix[row]?.[column]) miniCell.classList.add(`color-${type}`);
      container.appendChild(miniCell);
    }
  }
}

function updateStats() {
  scoreElement.textContent = String(score).padStart(6, '0');
  levelElement.textContent = level;
  linesElement.textContent = lines;
  bestScoreElement.textContent = String(bestScore).padStart(6, '0');
}

function updateStatusDisplay() {
  statusLabel.className = `status-label ${status}`;
  statusLabel.textContent = { ready: 'READY', playing: 'PLAYING', paused: 'PAUSED', over: 'GAME OVER' }[status];
  headerPauseIcon.textContent = status === 'paused' ? '▶' : 'Ⅱ';
  headerPause.setAttribute('aria-label', status === 'paused' ? '게임 계속하기' : '일시정지');
}

function showOverlay(kind) {
  const config = {
    ready: {
      icon: '▦', eyebrow: 'READY TO PLAY?', title: '블록을 쌓아보세요', message: '한 줄씩 지우며 최고 점수에 도전하세요.', action: '게임 시작', hint: '키보드 Space로도 시작할 수 있어요', stats: false,
    },
    paused: {
      icon: 'Ⅱ', eyebrow: 'GAME PAUSED', title: '잠시 쉬어가세요', message: '준비가 되면 게임을 계속하세요.', action: '계속하기', hint: 'P 키를 눌러도 계속할 수 있어요', stats: false,
    },
    over: {
      icon: '!', eyebrow: 'GAME OVER', title: '아쉬워요, 다시 도전!', message: '더 높은 점수를 향해 다시 시작해 보세요.', action: '다시 시작', hint: 'R 키를 눌러도 새 게임을 시작해요', stats: true,
    },
  }[kind];
  overlayIcon.textContent = config.icon;
  overlayEyebrow.textContent = config.eyebrow;
  overlayTitle.textContent = config.title;
  overlayMessage.textContent = config.message;
  overlayAction.textContent = config.action;
  overlayHint.textContent = config.hint;
  resultStats.hidden = !config.stats;
  if (config.stats) {
    document.querySelector('#result-score').textContent = score.toLocaleString('ko-KR');
    document.querySelector('#result-lines').textContent = lines;
    document.querySelector('#result-level').textContent = level;
  }
  overlay.classList.add('visible');
}

function hideOverlay() {
  overlay.classList.remove('visible');
}

function startGame() {
  board = createEmptyBoard();
  current = null;
  nextQueue = [];
  holdType = null;
  holdUsed = false;
  score = 0;
  lines = 0;
  level = 1;
  bag = [];
  status = 'playing';
  refillQueue();
  spawnPiece();
  hideOverlay();
  updateStats();
  lastDropAt = performance.now();
  render();
}

function togglePause() {
  if (status === 'playing') {
    status = 'paused';
    showOverlay('paused');
  } else if (status === 'paused') {
    status = 'playing';
    hideOverlay();
    lastDropAt = performance.now();
  }
  render();
}

function endGame() {
  status = 'over';
  if (score > bestScore) {
    bestScore = score;
    localStorage.setItem('tetris-best-score', String(bestScore));
  }
  updateStats();
  showOverlay('over');
  render();
}

function gameLoop(timestamp) {
  if (status === 'playing' && timestamp - lastDropAt >= getDropInterval()) {
    lastDropAt = timestamp;
    softDrop();
  }
  animationFrame = requestAnimationFrame(gameLoop);
}

function getDropInterval() {
  return Math.max(85, 850 - (level - 1) * 65);
}

function handleAction(action) {
  switch (action) {
    case 'left': movePiece(-1, 0); break;
    case 'right': movePiece(1, 0); break;
    case 'down': softDrop(); break;
    case 'hard-drop': hardDrop(); break;
    case 'rotate-left': rotatePiece(false); break;
    case 'rotate-right': rotatePiece(true); break;
    case 'hold': holdPiece(); break;
    case 'pause': togglePause(); break;
    default: break;
  }
}

document.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  const actionMap = {
    arrowleft: 'left', arrowright: 'right', arrowdown: 'down', arrowup: 'rotate-right',
    z: 'rotate-left', c: 'hold', p: 'pause', ' ': 'hard-drop',
  };
  if (key === 'r') {
    event.preventDefault();
    startGame();
    return;
  }
  if (key === ' ' || actionMap[key]) event.preventDefault();
  if (key === ' ' && status === 'ready') {
    startGame();
    return;
  }
  if (actionMap[key]) handleAction(actionMap[key]);
});

document.querySelectorAll('[data-action]').forEach((button) => {
  button.addEventListener('click', () => handleAction(button.dataset.action));
});

overlayAction.addEventListener('click', () => {
  if (status === 'paused') togglePause();
  else startGame();
});
headerPause.addEventListener('click', togglePause);
document.querySelector('#new-game').addEventListener('click', startGame);

createCells();
refillQueue();
updateStats();
render();
animationFrame = requestAnimationFrame(gameLoop);
