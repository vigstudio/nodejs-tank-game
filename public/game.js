// Khai báo biến và phần tử DOM
const startScreen = document.getElementById('startScreen');
const startButton = document.getElementById('startButton');
const gameContainer = document.getElementById('gameContainer');
const gameArea = document.getElementById('gameArea');
const minimap = document.getElementById('minimap');
const playerCountElement = document.getElementById('playerCount');
const playerHealthElement = document.getElementById('playerHealth');
const playerScoreElement = document.getElementById('playerScore');
const respawnTimerElement = document.getElementById('respawnTimer');
const coordXElement = document.getElementById('coordX');
const coordYElement = document.getElementById('coordY');
const fpsCounterElement = document.getElementById('fpsCounter');

// Kích thước bản đồ và cửa sổ hiển thị
const MAP_WIDTH = 8000;
const MAP_HEIGHT = 6000;
const VIEWPORT_WIDTH = 800;
const VIEWPORT_HEIGHT = 600;

// Cấu hình chướng ngại vật
const OBSTACLE_COUNT = 20; // Số lượng chướng ngại vật
const MIN_OBSTACLE_SIZE = 80; // Kích thước tối thiểu
const MAX_OBSTACLE_SIZE = 300; // Kích thước tối đa

// Cấu hình bom
const MAX_BOMBS = 10; // Số lượng bom tối đa
const BOMB_SPAWN_INTERVAL = 8000; // Tần suất sinh bom (8 giây)
const BOMB_EXPLOSION_RADIUS = 200; // Bán kính nổ
const BOMB_DAMAGE = 40; // Sát thương cơ bản

const players = {};
const bullets = {};
const minimapMarkers = {};
const obstacles = []; // Mảng lưu trữ chướng ngại vật
const bombs = []; // Mảng lưu trữ bom
let myPlayerId = null;
let isDead = false;

// Theo dõi vị trí chuột
let mouseX = 0;
let mouseY = 0;

// Biến camera
let cameraX = 0;
let cameraY = 0;

// Kích thước của người chơi
const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 50;

// Biến theo dõi các phím được nhấn
const keysPressed = {
    ArrowUp: false,
    ArrowDown: false,
    ArrowLeft: false,
    ArrowRight: false,
    w: false,
    a: false,
    s: false,
    d: false
};

// Cấu hình game
const gameConfig = {
    moveSpeed: 7,           // Tăng tốc độ di chuyển lên
    bulletSpeed: 15,        // Tăng tốc độ đạn
    controlSensitivity: 1.0 // Hệ số nhạy điều khiển
};

// FPS monitoring
let frameCount = 0;
let fpsStart = 0;
let fps = 0;

// Vòng lặp game hiệu quả hơn
let lastTime = 0;
let deltaTime = 0;
let frameTimes = [];
const MAX_FRAME_TIMES = 60; // Số frame để tính trung bình FPS

// Thiết lập ping để giữ kết nối
let pingInterval;
let pingStartTime = 0;
let pingTime = 0;

// Game đã sẵn sàng
let gameInitialized = false;

// Sự kiện click nút bắt đầu
startButton.addEventListener('click', () => {
    console.log('Bắt đầu game...');
    
    // Ẩn màn hình bắt đầu
    startScreen.style.display = 'none';
    
    // Hiển thị thông báo "Đang kết nối..."
    const loadingMessage = document.createElement('div');
    loadingMessage.id = 'loadingMessage';
    loadingMessage.innerHTML = 'Đang kết nối...';
    loadingMessage.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background-color: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 20px;
        border-radius: 10px;
        font-weight: bold;
        z-index: 9999;
    `;
    document.body.appendChild(loadingMessage);
    
    // Khởi tạo game nếu chưa khởi tạo
    if (!gameInitialized) {
        initializeSocketConnection();
        gameInitialized = true;
    }
});

// Khởi tạo kết nối Socket.IO
function initializeSocketConnection() {
    console.log('Đang khởi tạo kết nối Socket.IO...');
    
    // Kết nối tới máy chủ Socket.IO
    const socket = window.socket = io({
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
        forceNew: true  // Đảm bảo kết nối mới
    });

    console.log('Socket được tạo:', socket);
    
    // Xử lý kết nối thành công
    socket.on('connect', () => {
        console.log('Kết nối socket thành công với ID:', socket.id);
        
        // Xóa thông báo loading nếu có
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) {
            document.body.removeChild(loadingMessage);
        }
        
        // Bắt đầu sinh bom
        setInterval(() => {
            spawnBomb();
        }, BOMB_SPAWN_INTERVAL);
        
        // Gửi yêu cầu đăng ký người chơi mới
        console.log('Gửi yêu cầu đăng ký người chơi');
        socket.emit('registerPlayer', {
            screenWidth: window.innerWidth,
            screenHeight: window.innerHeight
        });
    });

    // Xử lý lỗi kết nối
    socket.on('connect_error', (error) => {
        console.error('Lỗi kết nối Socket.IO:', error);
        
        // Hiển thị thông báo lỗi cho người dùng
        const loadingMessage = document.getElementById('loadingMessage');
        if (loadingMessage) {
            loadingMessage.innerHTML = 'Không thể kết nối đến máy chủ. Đang thử lại...';
        }
    });
    
    // Thiết lập các event listener
    setupSocketEvents(socket);
    
    // Thiết lập ping
    setupPing(socket);
    
    // Thiết lập điều khiển cảm ứng
    setupTouchControls();
    
    // Bắt đầu vòng lặp game
    requestAnimationFrame(gameLoop);
}

// Thiết lập các event listener cho socket
function setupSocketEvents(socket) {
    // Xử lý khi mất kết nối
    socket.on('disconnect', () => {
        console.log('Mất kết nối đến máy chủ!');
        
        // Hiển thị thông báo cho người dùng
        const disconnectMessage = document.createElement('div');
        disconnectMessage.id = 'disconnectMessage';
        disconnectMessage.innerHTML = 'Mất kết nối đến máy chủ! Đang kết nối lại...';
        disconnectMessage.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background-color: rgba(255, 0, 0, 0.8);
            color: white;
            padding: 20px;
            border-radius: 10px;
            font-weight: bold;
            z-index: 9999;
        `;
        document.body.appendChild(disconnectMessage);
        
        // Dừng ping
        clearInterval(pingInterval);
    });

    // Xử lý khi kết nối thành công
    socket.on('connect', () => {
        console.log('Kết nối thành công với ID:', socket.id);
        
        // Xóa thông báo mất kết nối nếu có
        const disconnectMessage = document.getElementById('disconnectMessage');
        if (disconnectMessage) {
            document.body.removeChild(disconnectMessage);
        }
        
        // Thử đăng ký lại người chơi nếu cần
        if (!myPlayerId) {
            socket.emit('registerPlayer', {
                screenWidth: window.innerWidth,
                screenHeight: window.innerHeight
            });
        }
        
        // Khởi động lại ping
        setupPing(socket);
    });

    // Xử lý khi nhận ID người chơi
    socket.on('playerId', (id) => {
        console.log('Nhận ID người chơi:', id);
        myPlayerId = id;
    });

    // Xử lý nhận thông tin người chơi hiện tại
    socket.on('currentPlayers', (playersData) => {
        console.log('Nhận thông tin người chơi hiện tại:', playersData);
        
        // Lưu ID của người chơi hiện tại
        myPlayerId = socket.id;
        console.log('ID người chơi của tôi:', myPlayerId);
        
        // Xóa tất cả người chơi cũ nếu đang khởi động lại
        const playerKeys = Object.keys(players);
        console.log('Số lượng người chơi hiện tại trước khi xóa:', playerKeys.length);
        
        playerKeys.forEach(playerId => {
            if (players[playerId].element) {
                gameArea.removeChild(players[playerId].element);
            }
            if (minimapMarkers[playerId]) {
                minimap.removeChild(minimapMarkers[playerId]);
            }
        });
        
        // Xóa mảng người chơi và điểm đánh dấu hiện tại
        for (const key in players) {
            delete players[key];
        }
        
        for (const key in minimapMarkers) {
            delete minimapMarkers[key];
        }
        
        console.log('Đã xóa người chơi cũ');
        
        // Thêm tất cả người chơi vào màn hình
        const newPlayerKeys = Object.keys(playersData);
        console.log('Số lượng người chơi cần thêm:', newPlayerKeys.length);
        
        newPlayerKeys.forEach((playerId) => {
            console.log('Thêm người chơi:', playerId, playersData[playerId]);
            addPlayer(playersData[playerId]);
        });
        
        console.log('Đã thêm tất cả người chơi');
        console.log('Người chơi hiện tại:', players);
        
        // Cập nhật số lượng người chơi
        updatePlayerCount();
        
        // Cập nhật chỉ số máu và điểm của người chơi hiện tại
        if (players[myPlayerId]) {
            console.log('Cập nhật thông tin người chơi của tôi');
            updateMyStats();
            
            // Đặt camera vào vị trí người chơi
            const playerX = parseInt(players[myPlayerId].element.style.left);
            const playerY = parseInt(players[myPlayerId].element.style.top);
            centerCameraOnPlayer(playerX, playerY);
        } else {
            console.error('Không tìm thấy thông tin người chơi của tôi trong danh sách người chơi');
            // Tự động đăng ký lại nếu không tìm thấy thông tin
            socket.emit('registerPlayer', {
                screenWidth: window.innerWidth,
                screenHeight: window.innerHeight
            });
        }
    });

    // Xử lý khi có người chơi mới
    socket.on('newPlayer', (playerData) => {
        addPlayer(playerData);
        updatePlayerCount();
    });

    // Xử lý khi có người chơi di chuyển
    socket.on('playerMoved', (playerData) => {
        // Cập nhật vị trí của người chơi
        if (players[playerData.id]) {
            players[playerData.id].element.style.left = playerData.x + 'px';
            players[playerData.id].element.style.top = playerData.y + 'px';
            updateMinimapMarker(playerData.id, playerData.x, playerData.y);
            
            // Nếu đây là thông báo đặt lại vị trí cho chính người chơi
            if (playerData.resetPosition && playerData.id === myPlayerId) {
                console.log('Đặt lại vị trí do va chạm với chướng ngại vật');
            }
        }
    });

    // Xử lý khi có đạn được tạo
    socket.on('bulletCreated', (bulletData) => {
        createBullet(bulletData);
    });

    // Xử lý khi máu người chơi được cập nhật
    socket.on('playerHealthUpdate', (data) => {
        if (players[data.id]) {
            players[data.id].health = data.health;
            updateHealthBar(data.id);
            
            if (data.id === myPlayerId) {
                updateMyStats();
            }
        }
    });

    // Xử lý khi điểm số người chơi được cập nhật
    socket.on('playerScoreUpdate', (data) => {
        if (players[data.id]) {
            players[data.id].score = data.score;
            
            if (data.id === myPlayerId) {
                updateMyStats();
            }
        }
    });

    // Xử lý khi người chơi chết
    socket.on('playerDied', (playerId) => {
        if (players[playerId]) {
            players[playerId].isDead = true;
            players[playerId].element.classList.add('dead');
            
            if (playerId === myPlayerId) {
                isDead = true;
                startRespawnTimer(4);
            }
        }
    });

    // Xử lý khi người chơi hồi sinh
    socket.on('playerRespawned', (data) => {
        if (players[data.id]) {
            players[data.id].isDead = false;
            players[data.id].health = data.health;
            players[data.id].element.style.left = data.x + 'px';
            players[data.id].element.style.top = data.y + 'px';
            players[data.id].element.classList.remove('dead');
            updateHealthBar(data.id);
            updateMinimapMarker(data.id, data.x, data.y);
            
            if (data.id === myPlayerId) {
                isDead = false;
                respawnTimerElement.style.display = 'none';
                updateMyStats();
                centerCameraOnPlayer(data.x, data.y);
            }
        }
    });

    // Xử lý khi có người chơi ngắt kết nối
    socket.on('playerDisconnected', (playerId) => {
        removePlayer(playerId);
        updatePlayerCount();
    });

    // Xử lý khi nhận danh sách chướng ngại vật từ server
    socket.on('obstacleList', (obstacleData) => {
        console.log('Nhận thông tin chướng ngại vật từ server:', obstacleData);
        
        // Xóa chướng ngại vật cũ nếu có
        obstacles.forEach(obstacle => {
            if (obstacle.element) {
                gameArea.removeChild(obstacle.element);
            }
        });
        
        // Xóa mảng
        obstacles.length = 0;
        
        // Thêm chướng ngại vật mới từ server
        obstacleData.forEach(obstacle => {
            // Tạo phần tử chướng ngại vật
            const obstacleElement = document.createElement('div');
            obstacleElement.className = 'obstacle';
            obstacleElement.style.width = obstacle.width + 'px';
            obstacleElement.style.height = obstacle.height + 'px';
            obstacleElement.style.left = obstacle.x + 'px';
            obstacleElement.style.top = obstacle.y + 'px';
            
            // Thêm vào game area
            gameArea.appendChild(obstacleElement);
            
            // Lưu thông tin chướng ngại vật
            obstacles.push({
                id: obstacle.id,
                element: obstacleElement,
                x: obstacle.x,
                y: obstacle.y,
                width: obstacle.width,
                height: obstacle.height
            });
        });
        
        console.log(`Đã tạo ${obstacles.length} chướng ngại vật trên client`);
    });
}

// Thiết lập ping-pong để duy trì kết nối
function setupPing(socket) {
    // Gửi ping mỗi 3 giây để giữ kết nối
    pingInterval = setInterval(() => {
        pingStartTime = Date.now();
        socket.emit('ping');
    }, 3000);
    
    // Nhận pong từ server
    socket.on('pong', () => {
        pingTime = Date.now() - pingStartTime;
        
        // Hiển thị ping
        if (fpsCounterElement) {
            fpsCounterElement.textContent = `FPS: ${fps} | Ping: ${pingTime}ms`;
        }
    });
}

// Điều chỉnh độ nhạy cảm ứng cho thiết bị di động (mobile/tablets)
function setupTouchControls() {
    // Chỉ áp dụng cho thiết bị cảm ứng
    if ('ontouchstart' in window) {
        const touchControls = document.createElement('div');
        touchControls.id = 'touchControls';
        touchControls.innerHTML = `
            <div id="joystick">
                <div id="joystickKnob"></div>
            </div>
            <div id="shootButton"></div>
        `;
        document.body.appendChild(touchControls);
        
        // Thêm CSS cho touch controls
        const style = document.createElement('style');
        style.innerHTML = `
            #touchControls {
                position: fixed;
                bottom: 20px;
                left: 0;
                right: 0;
                height: 150px;
                z-index: 1000;
                pointer-events: none;
            }
            #joystick {
                position: absolute;
                left: 50px;
                bottom: 50px;
                width: 100px;
                height: 100px;
                border-radius: 50%;
                background: rgba(255,255,255,0.3);
                border: 2px solid #fff;
                pointer-events: auto;
            }
            #joystickKnob {
                position: absolute;
                top: 50%;
                left: 50%;
                transform: translate(-50%, -50%);
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: rgba(255,255,255,0.8);
            }
            #shootButton {
                position: absolute;
                right: 50px;
                bottom: 50px;
                width: 80px;
                height: 80px;
                border-radius: 50%;
                background: rgba(255,0,0,0.5);
                border: 2px solid #fff;
                pointer-events: auto;
            }
        `;
        document.head.appendChild(style);
        
        // Thêm logic xử lý cho joystick và nút bắn
        setupJoystick();
        setupShootButton();
    }
}

// Hàm cài đặt joystick
function setupJoystick() {
    const joystick = document.getElementById('joystick');
    const knob = document.getElementById('joystickKnob');
    let isDragging = false;
    let centerX, centerY;
    
    joystick.addEventListener('touchstart', (e) => {
        e.preventDefault();
        isDragging = true;
        const rect = joystick.getBoundingClientRect();
        centerX = rect.left + rect.width / 2;
        centerY = rect.top + rect.height / 2;
        handleJoystickMove(e);
    });
    
    document.addEventListener('touchmove', (e) => {
        if (isDragging) handleJoystickMove(e);
    });
    
    document.addEventListener('touchend', (e) => {
        if (isDragging) {
            isDragging = false;
            knob.style.transform = 'translate(-50%, -50%)';
            // Dừng di chuyển
            keysPressed.w = false;
            keysPressed.a = false;
            keysPressed.s = false;
            keysPressed.d = false;
        }
    });
    
    function handleJoystickMove(e) {
        const touch = e.touches[0];
        const maxDistance = 40;
        
        let deltaX = touch.clientX - centerX;
        let deltaY = touch.clientY - centerY;
        
        // Giới hạn khoảng cách
        const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
        if (distance > maxDistance) {
            deltaX = deltaX / distance * maxDistance;
            deltaY = deltaY / distance * maxDistance;
        }
        
        // Di chuyển joystick knob
        knob.style.transform = `translate(calc(-50% + ${deltaX}px), calc(-50% + ${deltaY}px))`;
        
        // Cập nhật các phím được nhấn dựa trên hướng joystick
        keysPressed.w = deltaY < -10;
        keysPressed.s = deltaY > 10;
        keysPressed.a = deltaX < -10;
        keysPressed.d = deltaX > 10;
    }
}

// Hàm cài đặt nút bắn
function setupShootButton() {
    const shootButton = document.getElementById('shootButton');
    
    shootButton.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleShooting();
    });
}

// Thêm người chơi mới vào màn hình
function addPlayer(playerData) {
    console.log('Thêm người chơi:', playerData.id, playerData);
    
    // Tạo phần tử div cho người chơi
    const playerElement = document.createElement('div');
    playerElement.className = 'player';
    playerElement.style.left = playerData.x + 'px';
    playerElement.style.top = playerData.y + 'px';
    playerElement.style.backgroundColor = playerData.color;
    
    if (playerData.isDead) {
        playerElement.classList.add('dead');
    }
    
    // Tạo thanh máu
    const healthBar = document.createElement('div');
    healthBar.className = 'health-bar';
    
    const healthFill = document.createElement('div');
    healthFill.className = 'health-fill';
    healthFill.style.width = (playerData.health / 100 * 100) + '%';
    
    healthBar.appendChild(healthFill);
    playerElement.appendChild(healthBar);
    
    // Đánh dấu người chơi là mình nếu đúng
    if (playerData.id === myPlayerId) {
        playerElement.textContent = 'Bạn';
        playerElement.style.border = '2px solid white';
        playerElement.style.zIndex = "10"; // Đặt người chơi hiển thị trên các phần tử khác
        
        // Tạo đường ngắm cho người chơi
        const aimLine = document.createElement('div');
        aimLine.className = 'aim-line';
        aimLine.style.width = '50px'; // Chiều dài đường ngắm
        aimLine.style.left = (PLAYER_WIDTH / 2) + 'px'; // Bắt đầu từ giữa người chơi
        aimLine.style.top = (PLAYER_HEIGHT / 2) + 'px'; 
        playerElement.appendChild(aimLine);
        
        console.log('Đã tạo đường ngắm cho người chơi');
    } else {
        playerElement.textContent = 'P' + playerData.id.substr(0, 2);
    }
    
    // Thêm vào gameArea và lưu trữ
    gameArea.appendChild(playerElement);
    
    // Lưu thông tin người chơi
    players[playerData.id] = {
        element: playerElement,
        health: playerData.health,
        score: playerData.score,
        isDead: playerData.isDead
    };
    
    // Thêm điểm đánh dấu trên minimap
    addMinimapMarker(playerData.id, playerData.x, playerData.y, playerData.color);
}

// Xóa người chơi khỏi màn hình
function removePlayer(playerId) {
    if (players[playerId]) {
        gameArea.removeChild(players[playerId].element);
        delete players[playerId];
        
        // Xóa điểm đánh dấu trên minimap
        if (minimapMarkers[playerId]) {
            minimap.removeChild(minimapMarkers[playerId]);
            delete minimapMarkers[playerId];
        }
    }
}

// Cập nhật số lượng người chơi
function updatePlayerCount() {
    playerCountElement.textContent = Object.keys(players).length;
}

// Cập nhật chỉ số máu và điểm của người chơi hiện tại
function updateMyStats() {
    if (players[myPlayerId]) {
        playerHealthElement.textContent = players[myPlayerId].health;
        playerScoreElement.textContent = players[myPlayerId].score;
    }
}

// Cập nhật thanh máu
function updateHealthBar(playerId) {
    if (players[playerId] && players[playerId].element) {
        const healthBar = players[playerId].element.querySelector('.health-fill');
        if (healthBar) {
            healthBar.style.width = (players[playerId].health / 100 * 100) + '%';
        }
    }
}

// Cập nhật vị trí điểm đánh dấu trên minimap
function updateMinimapMarker(playerId, x, y) {
    if (minimapMarkers[playerId]) {
        // Tính toán tỷ lệ với kích thước mới của bản đồ
        const minimapX = (x / MAP_WIDTH) * 200;
        const minimapY = (y / MAP_HEIGHT) * 150;
        
        minimapMarkers[playerId].style.left = minimapX + 'px';
        minimapMarkers[playerId].style.top = minimapY + 'px';
    }
}

// Thêm điểm đánh dấu trên minimap
function addMinimapMarker(playerId, x, y, color) {
    const marker = document.createElement('div');
    marker.className = 'minimap-player';
    marker.style.backgroundColor = color;
    
    // Nếu là người chơi hiện tại, thêm class đặc biệt
    if (playerId === myPlayerId) {
        marker.classList.add('minimap-me');
    }
    
    // Tính toán vị trí tỷ lệ trên minimap
    const minimapX = (x / MAP_WIDTH) * 200;
    const minimapY = (y / MAP_HEIGHT) * 150;
    
    marker.style.left = minimapX + 'px';
    marker.style.top = minimapY + 'px';
    
    minimap.appendChild(marker);
    minimapMarkers[playerId] = marker;
}

// Căn giữa camera vào người chơi
function centerCameraOnPlayer(playerX, playerY) {
    // Tính toán vị trí camera để giữ người chơi ở giữa
    // Cần tính từ tâm của nhân vật, không phải góc trên bên trái
    const playerCenterX = playerX + PLAYER_WIDTH / 2;
    const playerCenterY = playerY + PLAYER_HEIGHT / 2;
    
    // Sử dụng kích thước thực tế của gameContainer thay vì VIEWPORT cố định
    const viewportWidth = gameContainer.clientWidth;
    const viewportHeight = gameContainer.clientHeight;
    
    // Tính toán vị trí camera mới
    cameraX = playerCenterX - viewportWidth / 2;
    cameraY = playerCenterY - viewportHeight / 2;
    
    // Giới hạn camera trong phạm vi bản đồ
    cameraX = Math.max(0, Math.min(MAP_WIDTH - viewportWidth, cameraX));
    cameraY = Math.max(0, Math.min(MAP_HEIGHT - viewportHeight, cameraY));
    
    // Cập nhật vị trí gameArea
    gameArea.style.transform = `translate(${-cameraX}px, ${-cameraY}px)`;
    
    // Cập nhật tọa độ hiển thị
    coordXElement.textContent = Math.round(playerX);
    coordYElement.textContent = Math.round(playerY);
}

// Xử lý sự kiện chuột di chuyển
gameContainer.addEventListener('mousemove', (e) => {
    if (!gameInitialized) return; // Không xử lý nếu game chưa bắt đầu
    
    // Lưu vị trí chuột tương đối với gameContainer
    const rect = gameContainer.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
    
    // Debug
    console.log(`Vị trí chuột: ${mouseX}, ${mouseY}`);
    
    // Cập nhật đường ngắm ngay khi di chuyển chuột
    updateAimLine();
});

// Xử lý sự kiện click chuột
gameContainer.addEventListener('mousedown', (e) => {
    if (!gameInitialized) return; // Không xử lý nếu game chưa bắt đầu
    
    console.log('Nhấn chuột', e.button);
    
    // Chỉ xử lý click chuột trái (e.button === 0)
    if (e.button === 0) {
        e.preventDefault(); // Ngăn chặn hành vi mặc định
        console.log('Bắn đạn');
        handleShooting();
    }
});

// Hàm bắn đạn
function handleShooting() {
    if (!window.socket || !myPlayerId || !players[myPlayerId] || isDead) {
        console.log('Không thể bắn:', { 
            socket: !!window.socket, 
            myPlayerId, 
            playerExists: myPlayerId ? !!players[myPlayerId] : false, 
            isDead 
        });
        return;
    }
    
    console.log('Xử lý bắn đạn');
    
    // Lấy vị trí người chơi
    const playerElement = players[myPlayerId].element;
    const playerX = parseInt(playerElement.style.left) + PLAYER_WIDTH / 2; // Giữa người chơi
    const playerY = parseInt(playerElement.style.top) + PLAYER_HEIGHT / 2;
    
    // Chuyển đổi vị trí chuột từ viewport sang không gian thế giới
    const worldMouseX = mouseX + cameraX;
    const worldMouseY = mouseY + cameraY;
    
    console.log('Người chơi:', { playerX, playerY });
    console.log('Chuột (thế giới):', { worldMouseX, worldMouseY });
    
    // Tính toán góc giữa người chơi và chuột
    const angle = Math.atan2(worldMouseY - playerY, worldMouseX - playerX);
    console.log('Góc bắn:', angle);
    
    // Tạo hiệu ứng bắn
    createMuzzleFlash(playerX, playerY, angle);
    
    // Gửi thông tin đạn lên máy chủ
    console.log('Gửi thông tin bắn đạn lên server');
    window.socket.emit('playerShoot', {
        x: playerX,
        y: playerY,
        angle: angle
    });
}

// Hiệu ứng nòng súng
function createMuzzleFlash(x, y, angle) {
    // Tạo hiệu ứng ánh sáng khi bắn
    const flash = document.createElement('div');
    flash.className = 'muzzle-flash';
    
    // Đặt vị trí và góc quay
    flash.style.left = x + 'px';
    flash.style.top = y + 'px';
    flash.style.transform = `rotate(${angle}rad)`;
    
    // Thêm vào game area
    gameArea.appendChild(flash);
    
    // Xóa hiệu ứng sau 100ms
    setTimeout(() => {
        if (gameArea.contains(flash)) {
            gameArea.removeChild(flash);
        }
    }, 100);
}

// Tạo đạn
function createBullet(bulletData) {
    console.log('Tạo đạn mới:', bulletData);
    
    const bulletElement = document.createElement('div');
    bulletElement.className = 'bullet';
    bulletElement.style.left = bulletData.x + 'px';
    bulletElement.style.top = bulletData.y + 'px';
    bulletElement.style.backgroundColor = 'red'; // Thay đổi màu đạn thành đỏ
    bulletElement.style.width = '12px'; // Tăng kích thước đạn
    bulletElement.style.height = '12px'; // Tăng kích thước đạn
    bulletElement.style.boxShadow = '0 0 10px rgba(255, 0, 0, 0.8)'; // Thêm hiệu ứng phát sáng
    
    gameArea.appendChild(bulletElement);
    
    bullets[bulletData.id] = {
        element: bulletElement,
        ownerId: bulletData.ownerId,
        x: bulletData.x,
        y: bulletData.y,
        angle: bulletData.angle,
        speed: gameConfig.bulletSpeed,
        creationTime: Date.now() // Thời điểm tạo đạn
    };
    
    console.log('Đã tạo đạn:', bulletData.id, bullets[bulletData.id]);
}

// Xóa đạn
function removeBullet(bulletId) {
    if (bullets[bulletId]) {
        gameArea.removeChild(bullets[bulletId].element);
        delete bullets[bulletId];
    }
}

// Xử lý sự kiện bàn phím
window.addEventListener('keydown', (e) => {
    if (!gameInitialized) return; // Không xử lý nếu game chưa bắt đầu
    
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        // Ngăn chặn các hành động mặc định của trình duyệt khi nhấn các phím điều khiển
        e.preventDefault();
        keysPressed[key] = true;
    }
}, false);

window.addEventListener('keyup', (e) => {
    if (!gameInitialized) return; // Không xử lý nếu game chưa bắt đầu
    
    const key = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd'].includes(key)) {
        keysPressed[key] = false;
    }
}, false);

// Hàm di chuyển người chơi
function movePlayer() {
    if (!window.socket || !myPlayerId || !players[myPlayerId] || isDead) return;
    
    // Lấy vị trí hiện tại
    let x = parseInt(players[myPlayerId].element.style.left);
    let y = parseInt(players[myPlayerId].element.style.top);
    
    // Tốc độ di chuyển dựa vào delta time để đảm bảo tốc độ di chuyển nhất quán
    const speed = gameConfig.moveSpeed * (deltaTime / 16); // Chuẩn hóa cho 60fps
    let moveX = 0;
    let moveY = 0;
    
    // Tính toán vector di chuyển dựa trên phím được nhấn
    if (keysPressed['arrowup'] || keysPressed['w']) {
        moveY -= speed;
    }
    if (keysPressed['arrowdown'] || keysPressed['s']) {
        moveY += speed;
    }
    if (keysPressed['arrowleft'] || keysPressed['a']) {
        moveX -= speed;
    }
    if (keysPressed['arrowright'] || keysPressed['d']) {
        moveX += speed;
    }
    
    // Chuẩn hóa vận tốc khi di chuyển chéo để tránh di chuyển nhanh hơn khi đi theo đường chéo
    if (moveX !== 0 && moveY !== 0) {
        const normalizeFactor = 1 / Math.sqrt(2);
        moveX *= normalizeFactor;
        moveY *= normalizeFactor;
    }
    
    // Cập nhật vị trí mới
    let newX = x + moveX;
    let newY = y + moveY;
    
    // Giới hạn trong phạm vi bản đồ
    newX = Math.max(0, Math.min(MAP_WIDTH - PLAYER_WIDTH, newX));
    newY = Math.max(0, Math.min(MAP_HEIGHT - PLAYER_HEIGHT, newY));
    
    // Kiểm tra nếu có sự thay đổi vị trí
    if (moveX !== 0 || moveY !== 0) {
        // Cập nhật vị trí sử dụng transform để cải thiện hiệu suất
        players[myPlayerId].element.style.left = newX + 'px';
        players[myPlayerId].element.style.top = newY + 'px';
        
        // Cập nhật camera theo vị trí người chơi
        centerCameraOnPlayer(newX, newY);
        
        // Cập nhật điểm đánh dấu trên minimap
        updateMinimapMarker(myPlayerId, newX, newY);
        
        // Sử dụng throttle để giảm số lần gửi lên server, mặc dù chuyển động vẫn mượt mà trên client
        if (!movePlayer.throttled) {
            window.socket.emit('playerMovement', { x: newX, y: newY });
            movePlayer.throttled = true;
            setTimeout(() => {
                movePlayer.throttled = false;
            }, 33); // 30fps - đủ cho network sync
        }
    }
}

// Cập nhật vị trí đường ngắm theo vị trí chuột
function updateAimLine() {
    if (!myPlayerId || !players[myPlayerId] || isDead) return;
    
    const playerElement = players[myPlayerId].element;
    const aimLine = playerElement.querySelector('.aim-line');
    
    if (!aimLine) {
        console.error('Không tìm thấy đường ngắm');
        return;
    }
    
    // Lấy vị trí của người chơi trong không gian thế giới
    const playerX = parseInt(playerElement.style.left);
    const playerY = parseInt(playerElement.style.top);
    
    // Chuyển đổi vị trí chuột từ viewport sang không gian thế giới
    const worldMouseX = mouseX + cameraX;
    const worldMouseY = mouseY + cameraY;
    
    // Tính toán góc giữa người chơi và chuột
    const playerCenterX = playerX + PLAYER_WIDTH / 2; // Giữa người chơi
    const playerCenterY = playerY + PLAYER_HEIGHT / 2;
    const angle = Math.atan2(worldMouseY - playerCenterY, worldMouseX - playerCenterX);
    
    // Cập nhật đường ngắm
    const aimLength = 50; // Tăng độ dài đường ngắm
    
    // Tính toán vị trí bắt đầu của đường ngắm ở tâm người chơi
    const startX = PLAYER_WIDTH / 2;
    const startY = PLAYER_HEIGHT / 2;
    
    aimLine.style.width = `${aimLength}px`;
    aimLine.style.left = `${startX}px`;
    aimLine.style.top = `${startY}px`;
    aimLine.style.transform = `rotate(${angle}rad)`;
}

// Cập nhật vị trí đạn
function updateBullets() {
    const bulletKeys = Object.keys(bullets);
    if (bulletKeys.length > 0) {
        console.log(`Đang cập nhật ${bulletKeys.length} đạn`);
    }
    
    bulletKeys.forEach(bulletId => {
        const bullet = bullets[bulletId];
        
        // Di chuyển đạn theo hướng và tốc độ
        bullet.x += Math.cos(bullet.angle) * bullet.speed;
        bullet.y += Math.sin(bullet.angle) * bullet.speed;
        
        // Cập nhật vị trí đạn trên màn hình
        bullet.element.style.left = bullet.x + 'px';
        bullet.element.style.top = bullet.y + 'px';
        
        // Kiểm tra va chạm với người chơi
        checkBulletCollisions(bulletId);
        
        // Kiểm tra đạn ra khỏi bản đồ hoặc tồn tại quá lâu (5 giây)
        if (bullet.x < 0 || bullet.x > MAP_WIDTH || bullet.y < 0 || bullet.y > MAP_HEIGHT ||
            Date.now() - bullet.creationTime > 5000) {
            removeBullet(bulletId);
        }
        
        // Kiểm tra va chạm với chướng ngại vật
        if (checkBulletObstacleCollision(bulletId)) {
            removeBullet(bulletId);
            return;
        }
    });
}

// Kiểm tra va chạm giữa đạn và người chơi
function checkBulletCollisions(bulletId) {
    if (!bullets[bulletId]) return;
    
    const bullet = bullets[bulletId];
    
    // Kiểm tra va chạm với người chơi
    Object.keys(players).forEach(playerId => {
        // Không kiểm tra người chơi đã chết hoặc người bắn đạn
        if (playerId === bullet.ownerId || players[playerId].isDead) return;
        
        const player = players[playerId];
        const playerElement = player.element;
        
        // Lấy vị trí và kích thước của người chơi
        const playerRect = {
            x: parseInt(playerElement.style.left),
            y: parseInt(playerElement.style.top),
            width: PLAYER_WIDTH,
            height: PLAYER_HEIGHT
        };
        
        // Tối ưu hóa kiểm tra va chạm sử dụng khoảng cách bán kính
        const playerCenterX = playerRect.x + playerRect.width / 2;
        const playerCenterY = playerRect.y + playerRect.height / 2;
        const dx = bullet.x - playerCenterX;
        const dy = bullet.y - playerCenterY;
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Nếu khoảng cách nhỏ hơn bán kính người chơi (tính gần đúng)
        if (distance < (playerRect.width / 2) + 5) {
            console.log('Phát hiện va chạm đạn:', bulletId, 'với người chơi:', playerId);
            
            // Gửi thông tin va chạm lên máy chủ
            window.socket.emit('bulletHit', {
                bulletId: bulletId,
                targetId: playerId,
                bulletOwnerId: bullet.ownerId
            });
            
            // Xóa đạn
            removeBullet(bulletId);
        }
    });
}

// Hàm bắt đầu đếm ngược hồi sinh
function startRespawnTimer(seconds) {
    let timeLeft = seconds;
    respawnTimerElement.textContent = `Hồi sinh sau: ${timeLeft}`;
    respawnTimerElement.style.display = 'block';
    
    const timerInterval = setInterval(() => {
        timeLeft--;
        respawnTimerElement.textContent = `Hồi sinh sau: ${timeLeft}`;
        
        if (timeLeft <= 0) {
            clearInterval(timerInterval);
        }
    }, 1000);
}

// Vòng lặp game hiệu quả hơn
function gameLoop(timestamp) {
    // Tính toán delta time để đảm bảo chuyển động mượt mà trên mọi thiết bị
    if (lastTime > 0) {
        deltaTime = timestamp - lastTime;
        
        // Lưu thời gian frame cho việc tính FPS
        frameTimes.push(deltaTime);
        if (frameTimes.length > MAX_FRAME_TIMES) {
            frameTimes.shift();
        }
        
        // Tính và cập nhật FPS mỗi 500ms
        frameCount++;
        if (timestamp - fpsStart >= 500) {
            const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
            fps = Math.round(1000 / avgFrameTime);
            fpsCounterElement.textContent = `FPS: ${fps}`;
            frameCount = 0;
            fpsStart = timestamp;
        }
    }
    lastTime = timestamp;
    
    // Cập nhật trạng thái game
    movePlayer();
    updateAimLine();
    updateBullets();
    
    // Cập nhật trạng thái bom
    updateBombs();
    
    // Tiếp tục vòng lặp
    requestAnimationFrame(gameLoop);
}

// Hàm khởi tạo game
function initGame() {
    console.log('Khởi tạo game...');
    
    // KHI TẢI TRANG, CHỈ HIỂN THỊ MÀN HÌNH BẮT ĐẦU
    // KHÔNG KẾT NỐI SOCKET NGAY LẬP TỨC
    
    // Game sẽ được khởi tạo khi người dùng nhấn nút bắt đầu
}

// Khởi tạo game khi trang đã tải xong
window.addEventListener('load', initGame);

// Tạo bom mới
function spawnBomb() {
    // Kiểm tra số lượng bom hiện tại
    if (bombs.length >= MAX_BOMBS) {
        // Xóa bom cũ nhất
        const oldestBomb = bombs.shift();
        if (oldestBomb.element) {
            gameArea.removeChild(oldestBomb.element);
        }
    }
    
    // Tính toán vị trí ngẫu nhiên cho bom
    const x = Math.floor(Math.random() * (MAP_WIDTH - 30));
    const y = Math.floor(Math.random() * (MAP_HEIGHT - 30));
    
    // Tạo phần tử bom
    const bombElement = document.createElement('div');
    bombElement.className = 'bomb';
    bombElement.style.left = x + 'px';
    bombElement.style.top = y + 'px';
    
    // Thêm vào game area
    gameArea.appendChild(bombElement);
    
    // Thời gian nổ ngẫu nhiên (5-10 giây)
    const explosionTime = Math.floor(Math.random() * 5000) + 5000;
    
    // Lưu thông tin bom
    const bomb = {
        element: bombElement,
        x: x,
        y: y,
        radius: 15, // Bán kính của bom
        creationTime: Date.now(),
        explosionTime: explosionTime
    };
    
    bombs.push(bomb);
    
    // Đặt hẹn giờ nổ
    setTimeout(() => {
        explodeBomb(bomb);
    }, explosionTime);
    
    console.log(`Tạo bom tại (${x}, ${y}), sẽ nổ sau ${explosionTime}ms`);
}

// Phát nổ bom
function explodeBomb(bomb) {
    if (!bomb || !bomb.element || !gameArea.contains(bomb.element)) return;
    
    console.log(`Bom nổ tại (${bomb.x}, ${bomb.y})`);
    
    // Tạo hiệu ứng nổ
    const explosionElement = document.createElement('div');
    explosionElement.className = 'explosion';
    explosionElement.style.left = (bomb.x + 15) + 'px'; // Đặt tâm vụ nổ tại tâm bom
    explosionElement.style.top = (bomb.y + 15) + 'px';
    
    // Thêm vào game area
    gameArea.appendChild(explosionElement);
    
    // Xóa hiệu ứng nổ sau khi hoàn thành
    setTimeout(() => {
        if (gameArea.contains(explosionElement)) {
            gameArea.removeChild(explosionElement);
        }
    }, 500);
    
    // Kiểm tra va chạm với người chơi
    Object.keys(players).forEach(playerId => {
        if (players[playerId].isDead) return;
        
        const player = players[playerId];
        const playerElement = player.element;
        
        // Lấy vị trí người chơi
        const playerX = parseInt(playerElement.style.left) + PLAYER_WIDTH / 2;
        const playerY = parseInt(playerElement.style.top) + PLAYER_HEIGHT / 2;
        
        // Tính khoảng cách từ người chơi đến tâm vụ nổ
        const dx = playerX - (bomb.x + 15);
        const dy = playerY - (bomb.y + 15);
        const distance = Math.sqrt(dx * dx + dy * dy);
        
        // Nếu người chơi trong bán kính nổ
        if (distance < BOMB_EXPLOSION_RADIUS) {
            // Tính sát thương giảm dần theo khoảng cách
            const damage = Math.round(BOMB_DAMAGE * (1 - distance / BOMB_EXPLOSION_RADIUS));
            
            console.log(`Người chơi ${playerId} bị trúng bom, sát thương: ${damage}`);
            
            // Gửi thông tin thiệt hại lên server
            if (window.socket) {
                window.socket.emit('bombDamage', {
                    playerId: playerId,
                    damage: damage
                });
            }
        }
    });
    
    // Xóa bom khỏi mảng và màn hình
    const bombIndex = bombs.findIndex(b => b === bomb);
    if (bombIndex !== -1) {
        bombs.splice(bombIndex, 1);
    }
    
    if (bomb.element && gameArea.contains(bomb.element)) {
        gameArea.removeChild(bomb.element);
    }
}

// Kiểm tra va chạm giữa đạn và chướng ngại vật
function checkBulletObstacleCollision(bulletId) {
    if (!bullets[bulletId]) return false;
    
    const bullet = bullets[bulletId];
    
    // Kiểm tra va chạm với từng chướng ngại vật
    for (let i = 0; i < obstacles.length; i++) {
        const obstacle = obstacles[i];
        
        // Kiểm tra nếu đạn nằm trong chướng ngại vật
        if (bullet.x >= obstacle.x && bullet.x <= obstacle.x + obstacle.width &&
            bullet.y >= obstacle.y && bullet.y <= obstacle.y + obstacle.height) {
            
            console.log(`Đạn ${bulletId} va chạm với chướng ngại vật`);
            return true;
        }
    }
    
    return false;
}

// Cập nhật trạng thái bom
function updateBombs() {
    const currentTime = Date.now();
    
    // Kiểm tra thời gian nổ của các bom
    bombs.forEach(bomb => {
        // Hiệu ứng pulse càng nhanh khi gần đến thời gian nổ
        const timeLeft = (bomb.creationTime + bomb.explosionTime) - currentTime;
        const pulseRate = Math.max(0.5, timeLeft / bomb.explosionTime * 2);
        bomb.element.style.animation = `bomb-pulse ${pulseRate}s infinite`;
    });
} 