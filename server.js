const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);

// Cấu hình Socket.IO với các tùy chọn tối ưu
const io = socketIO(server, {
  pingInterval: 10000, // Kiểm tra ping mỗi 10 giây
  pingTimeout: 5000,   // Timeout sau 5 giây không phản hồi
  transports: ['websocket', 'polling'], // Chỉ dùng websocket - nhanh hơn polling
  maxHttpBufferSize: 1e8 // Giới hạn kích thước gói tin
});

// Phục vụ các file tĩnh từ thư mục public
app.use(express.static(path.join(__dirname, 'public')));

// Kích thước bản đồ
const MAP_WIDTH = 8000;
const MAP_HEIGHT = 6000;

// Kích thước người chơi
const PLAYER_WIDTH = 50;
const PLAYER_HEIGHT = 50;

// Cấu hình chướng ngại vật
const OBSTACLE_COUNT = 25; // Số lượng chướng ngại vật
const MIN_OBSTACLE_SIZE = 100; // Kích thước tối thiểu
const MAX_OBSTACLE_SIZE = 350; // Kích thước tối đa
const obstacles = []; // Mảng lưu trữ thông tin chướng ngại vật

// Cấu hình bom
const BOMB_INTERVAL = 45000; // Tăng thời gian giữa các đợt bom (45 giây)
const BOMB_WARNING_TIME = 5000; // Thời gian cảnh báo trước khi bom nổ (5 giây)
const BOMB_EXPLOSION_RADIUS = 450; // Tăng bán kính nổ
const BOMB_DAMAGE = 70; // Tăng sát thương cơ bản
const BOMB_COUNT_PER_WAVE = 10; // Số lượng bom mỗi đợt
const bombs = []; // Mảng lưu trữ thông tin bom
let bombInterval; // Biến lưu interval để tạo bom

// Mảng lưu trữ thông tin người chơi
const players = {};

// Mảng lưu trữ thông tin đạn
const bullets = {};
let bulletId = 0;

// Theo dõi hiệu suất server
let updateCount = 0;
let lastStatsTime = Date.now();
let messagesPerSecond = 0;

// In thông tin khi máy chủ khởi động
console.log('Server đang khởi động...');

// Xử lý kết nối Socket.IO
io.on('connection', (socket) => {
  console.log(`Người chơi mới kết nối: ${socket.id}`);
  
  // Gửi thông tin chướng ngại vật cho client mới kết nối
  socket.emit('obstacleList', obstacles);
  
  // Xử lý đăng ký người chơi
  socket.on('registerPlayer', (data) => {
    console.log(`Đăng ký người chơi: ${socket.id}`, data);
    
    // Gửi ID cho người chơi
    socket.emit('playerId', socket.id);
    
    // Nếu người chơi này đã tồn tại, không tạo lại
    if (players[socket.id]) {
      console.log(`Người chơi ${socket.id} đã tồn tại, chỉ cập nhật thông tin`);
      socket.emit('currentPlayers', players);
      return;
    }
    
    // Thêm người chơi mới vào danh sách
    players[socket.id] = {
      id: socket.id,
      x: findSafePosition().x,
      y: findSafePosition().y,
      color: getRandomColor(),
      health: 100,
      score: 0,
      isDead: false,
      lastShotTime: 0,
      lastUpdateTime: Date.now()
    };
    
    console.log(`Đã tạo người chơi mới: ${socket.id} tại (${players[socket.id].x}, ${players[socket.id].y})`);
    
    // Gửi thông tin người chơi hiện tại
    socket.emit('currentPlayers', players);
    
    // Thông báo cho các người chơi khác về người chơi mới
    socket.broadcast.emit('newPlayer', players[socket.id]);
    
    console.log(`Tổng số người chơi: ${Object.keys(players).length}`);
  });
  
  // Xử lý khi người chơi ngắt kết nối
  socket.on('disconnect', () => {
    console.log(`Người chơi ngắt kết nối: ${socket.id}`);
    
    if (players[socket.id]) {
      // Thông báo cho các người chơi khác
      socket.broadcast.emit('playerDisconnected', socket.id);
      
      // Xóa người chơi khỏi danh sách
      delete players[socket.id];
      
      console.log(`Tổng số người chơi còn lại: ${Object.keys(players).length}`);
    }
  });
  
  // Xử lý khi người chơi bắn
  socket.on('playerShoot', (shootData) => {
    if (!players[socket.id] || players[socket.id].isDead) return;
    
    const now = Date.now();
    
    // Kiểm tra thời gian hồi chiêu (cooldown) - 300ms
    if (now - players[socket.id].lastShotTime >= 300) {
      players[socket.id].lastShotTime = now;
      
      // Tạo ID duy nhất cho đạn
      const newBulletId = 'bullet_' + bulletId++;
      
      // Tốc độ đạn cao hơn
      const bulletSpeed = 15;
      
      // Tạo đạn
      bullets[newBulletId] = {
        id: newBulletId,
        ownerId: socket.id,
        x: shootData.x,
        y: shootData.y,
        angle: shootData.angle,
        speed: bulletSpeed,
        createdTime: now
      };
      
      // Gửi thông tin đạn tới tất cả người chơi
      io.emit('bulletCreated', {
        id: newBulletId,
        ownerId: socket.id,
        x: shootData.x,
        y: shootData.y,
        angle: shootData.angle
      });
    }
  });
  
  // Xử lý khi đạn trúng người chơi
  socket.on('bulletHit', (hitData) => {
    // Lấy thông tin người bắn, người bị bắn và đạn
    const bulletOwnerId = hitData.bulletOwnerId;
    const targetId = hitData.targetId;
    const bulletId = hitData.bulletId;
    
    // Xác minh đạn và người chơi
    if (!bullets[bulletId] || !players[targetId] || players[targetId].isDead) return;
    
    // Xóa đạn
    delete bullets[bulletId];
    
    // Giảm máu người chơi bị bắn
    players[targetId].health -= 20;
    
    // Gửi thông tin máu mới
    io.emit('playerHealthUpdate', {
      id: targetId,
      health: players[targetId].health
    });
    
    // Kiểm tra nếu người chơi đã chết
    if (players[targetId].health <= 0) {
      // Đánh dấu người chơi là đã chết
      players[targetId].isDead = true;
      
      // Thông báo cho tất cả người chơi
      io.emit('playerDied', targetId);
      
      // Tăng điểm cho người bắn
      if (bulletOwnerId && players[bulletOwnerId]) {
        players[bulletOwnerId].score += 1;
        
        // Gửi thông tin điểm mới
        io.emit('playerScoreUpdate', {
          id: bulletOwnerId,
          score: players[bulletOwnerId].score
        });
      }
      
      // Hồi sinh sau 4 giây
      setTimeout(() => {
        if (players[targetId]) {
          players[targetId].health = 100;
          players[targetId].isDead = false;
          players[targetId].x = Math.floor(Math.random() * (MAP_WIDTH - 200)) + 100;
          players[targetId].y = Math.floor(Math.random() * (MAP_HEIGHT - 200)) + 100;
          
          io.emit('playerRespawned', {
            id: targetId,
            x: players[targetId].x,
            y: players[targetId].y,
            health: players[targetId].health
          });
        }
      }, 4000);
    }
  });
  
  // Xử lý ping từ client
  socket.on('ping', () => {
    socket.emit('pong');
  });
  
  // Xử lý di chuyển của người chơi với throttling
  socket.on('playerMovement', (movementData) => {
    if (!players[socket.id]) {
      console.log(`Không tìm thấy thông tin người chơi ${socket.id} cho di chuyển`);
      return;
    }
    
    const now = Date.now();
    
    // Giới hạn tốc độ cập nhật (không quá 50 lần/giây)
    if (now - players[socket.id].lastUpdateTime >= 20) {
      players[socket.id].lastUpdateTime = now;
      
      // Lưu vị trí hiện tại để khôi phục nếu có va chạm
      const oldX = players[socket.id].x;
      const oldY = players[socket.id].y;
      
      // Tính vị trí mới
      const newX = Math.max(0, Math.min(MAP_WIDTH - PLAYER_WIDTH, movementData.x));
      const newY = Math.max(0, Math.min(MAP_HEIGHT - PLAYER_HEIGHT, movementData.y));
      
      // Kiểm tra va chạm với chướng ngại vật
      if (checkPlayerObstacleCollision(newX, newY)) {
        // Nếu có va chạm, gửi lại vị trí cũ cho người chơi
        socket.emit('playerMoved', {
          id: socket.id,
          x: oldX,
          y: oldY,
          resetPosition: true // Đánh dấu để client biết cần đặt lại vị trí
        });
      } else {
        // Nếu không có va chạm, cập nhật vị trí và thông báo cho các người chơi khác
        players[socket.id].x = newX;
        players[socket.id].y = newY;
        
        // Gửi thông tin di chuyển tới tất cả người chơi khác
        socket.broadcast.emit('playerMoved', {
          id: socket.id,
          x: players[socket.id].x,
          y: players[socket.id].y
        });
        
        // Theo dõi hiệu suất
        updateCount++;
      }
    }
  });
});

// Hàm tạo màu ngẫu nhiên
function getRandomColor() {
  const colors = ['#ff4d4d', '#4d94ff', '#33cc33', '#ff9933', '#cc33ff', '#4dffff', '#ffff4d', '#ff4dff'];
  return colors[Math.floor(Math.random() * colors.length)];
}

// Tạo chướng ngại vật ngẫu nhiên
function generateObstacles() {
  console.log('Tạo chướng ngại vật trên server...');
  
  // Xóa mảng nếu đã có dữ liệu
  obstacles.length = 0;
  
  // Tạo chướng ngại vật mới
  for (let i = 0; i < OBSTACLE_COUNT; i++) {
    const width = Math.floor(Math.random() * (MAX_OBSTACLE_SIZE - MIN_OBSTACLE_SIZE)) + MIN_OBSTACLE_SIZE;
    const height = Math.floor(Math.random() * (MAX_OBSTACLE_SIZE - MIN_OBSTACLE_SIZE)) + MIN_OBSTACLE_SIZE;
    
    // Tính toán vị trí ngẫu nhiên
    const x = Math.floor(Math.random() * (MAP_WIDTH - width));
    const y = Math.floor(Math.random() * (MAP_HEIGHT - height));
    
    // Lưu thông tin chướng ngại vật
    obstacles.push({
      id: `obstacle_${i}`,
      x: x,
      y: y,
      width: width,
      height: height
    });
  }
  
  console.log(`Đã tạo ${obstacles.length} chướng ngại vật trên server`);
}

// Kiểm tra va chạm giữa người chơi và chướng ngại vật
function checkPlayerObstacleCollision(playerX, playerY) {
  for (let i = 0; i < obstacles.length; i++) {
    const obstacle = obstacles[i];
    
    // Kiểm tra va chạm
    if (playerX + PLAYER_WIDTH > obstacle.x && playerX < obstacle.x + obstacle.width &&
        playerY + PLAYER_HEIGHT > obstacle.y && playerY < obstacle.y + obstacle.height) {
      return true; // Có va chạm
    }
  }
  
  return false; // Không có va chạm
}

// Tìm vị trí an toàn không bị chướng ngại vật chặn
function findSafePosition() {
  let x, y;
  let attempts = 0;
  const maxAttempts = 50; // Giới hạn số lần thử để tránh vòng lặp vô hạn
  
  do {
    // Chọn vị trí ngẫu nhiên
    x = Math.random() * (MAP_WIDTH - PLAYER_WIDTH);
    y = Math.random() * (MAP_HEIGHT - PLAYER_HEIGHT);
    attempts++;
    
    // Kiểm tra va chạm với chướng ngại vật
    if (!checkPlayerObstacleCollision(x, y)) {
      return { x, y }; // Trả về vị trí an toàn
    }
  } while (attempts < maxAttempts);
  
  // Nếu không tìm được vị trí an toàn sau nhiều lần thử, tìm vị trí an toàn đơn giản hơn
  console.log("Không tìm được vị trí an toàn sau nhiều lần thử, sử dụng vị trí mặc định");
  
  // Vị trí mặc định - giữa bản đồ
  return {
    x: MAP_WIDTH / 2,
    y: MAP_HEIGHT / 2
  };
}

// Log server performance every 5 seconds
setInterval(() => {
  const now = Date.now();
  const elapsed = (now - lastStatsTime) / 1000;
  messagesPerSecond = Math.round(updateCount / elapsed);
  
  console.log(`Server performance: ${messagesPerSecond} messages/sec, ${Object.keys(players).length} players, ${Object.keys(bullets).length} bullets`);
  
  // Reset counters
  updateCount = 0;
  lastStatsTime = now;
  
  // Xóa đạn quá hạn (đạn tồn tại quá lâu)
  const bulletsToRemove = [];
  
  for (const id in bullets) {
    if (now - bullets[id].createdTime > 5000) { // Xóa đạn sau 5 giây
      bulletsToRemove.push(id);
    }
  }
  
  bulletsToRemove.forEach(id => {
    delete bullets[id];
  });
  
}, 5000);

// Tạo bom mới
function spawnBomb() {
  console.log('Tạo nhóm bom mới trên server...');
  
  // Tạo một đợt gồm nhiều bom
  let bombPositions = [];
  
  for (let i = 0; i < BOMB_COUNT_PER_WAVE; i++) {
    // Tính toán vị trí ngẫu nhiên cho bom, phân bố trên toàn bản đồ
    const x = Math.floor(Math.random() * (MAP_WIDTH - 40));
    const y = Math.floor(Math.random() * (MAP_HEIGHT - 40));
    
    // Thời gian nổ = thời gian hiện tại + thời gian cảnh báo
    const explosionTime = Date.now() + BOMB_WARNING_TIME;
    
    // Tạo ID cho bom
    const bombId = 'bomb_' + Date.now() + '_' + i;
    
    // Lưu thông tin bom
    const bomb = {
      id: bombId,
      x: x,
      y: y,
      radius: 20, // Bán kính hiển thị của bom
      creationTime: Date.now(),
      explosionTime: explosionTime,
      warningShown: false // Biến đánh dấu đã hiển thị cảnh báo chưa
    };
    
    // Thêm bom vào mảng
    bombs.push(bomb);
    bombPositions.push({
      id: bombId,
      x: x,
      y: y
    });
    
    // Gửi thông tin bom tới tất cả người chơi
    io.emit('bombCreated', {
      id: bombId,
      x: x,
      y: y,
      explosionTime: explosionTime
    });
  }
  
  console.log(`Đã tạo ${BOMB_COUNT_PER_WAVE} quả bom, sẽ nổ sau ${BOMB_WARNING_TIME}ms`);
  
  // Đặt hẹn giờ hiển thị cảnh báo ngay lập tức
  io.emit('bombWarning', {
    message: `CẢNH BÁO: ${BOMB_COUNT_PER_WAVE} BOM SẼ NỔ SAU 5 GIÂY!`,
    bombPositions: bombPositions
  });
  
  // Đặt hẹn giờ nổ đồng thời tất cả bom
  setTimeout(() => {
    // Phát nổ tất cả bom trong đợt này
    bombs.filter(bomb => Date.now() >= bomb.explosionTime).forEach(bomb => {
      explodeBomb(bomb);
    });
  }, BOMB_WARNING_TIME);
}

// Phát nổ bom
function explodeBomb(bomb) {
  if (!bomb) return;
  
  console.log(`Bom nổ tại (${bomb.x}, ${bomb.y})`);
  
  // Gửi thông tin bom nổ tới tất cả người chơi
  io.emit('bombExploded', {
    id: bomb.id,
    x: bomb.x,
    y: bomb.y,
    radius: BOMB_EXPLOSION_RADIUS
  });
  
  // Kiểm tra va chạm với người chơi
  Object.keys(players).forEach(playerId => {
    if (players[playerId].isDead) return;
    
    // Lấy vị trí người chơi
    const playerX = players[playerId].x + PLAYER_WIDTH / 2;
    const playerY = players[playerId].y + PLAYER_HEIGHT / 2;
    
    // Tính khoảng cách từ người chơi đến tâm vụ nổ
    const dx = playerX - (bomb.x + 20); // 20 là bán kính của bom
    const dy = playerY - (bomb.y + 20);
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    // Nếu người chơi trong bán kính nổ
    if (distance < BOMB_EXPLOSION_RADIUS) {
      // Tính sát thương giảm dần theo khoảng cách
      const damage = Math.round(BOMB_DAMAGE * (1 - distance / BOMB_EXPLOSION_RADIUS));
      
      console.log(`Người chơi ${playerId} bị trúng bom, sát thương: ${damage}`);
      
      // Giảm máu người chơi
      players[playerId].health -= damage;
      
      // Kiểm tra người chơi có còn sống không
      if (players[playerId].health <= 0) {
        // Đánh dấu người chơi đã chết
        players[playerId].isDead = true;
        players[playerId].health = 0;
        players[playerId].deathTime = Date.now();
        
        // Gửi thông báo người chơi đã chết
        io.emit('playerDied', {
          id: playerId,
          killedBy: 'bomb'
        });
        
        // Đặt hẹn giờ để hồi sinh người chơi sau 5 giây
        setTimeout(() => {
          if (players[playerId]) {
            // Hồi sinh người chơi
            players[playerId].isDead = false;
            players[playerId].health = 100;
            
            // Tìm vị trí hồi sinh an toàn (không nằm trong chướng ngại vật)
            let safePosition = findSafePosition();
            
            // Đặt vị trí hồi sinh
            players[playerId].x = safePosition.x;
            players[playerId].y = safePosition.y;
            
            // Thông báo cho các người chơi về việc hồi sinh
            io.emit('playerRespawned', {
              id: playerId,
              x: players[playerId].x,
              y: players[playerId].y,
              health: players[playerId].health
            });
          }
        }, 5000);
      } else {
        // Gửi thông tin máu cập nhật đến tất cả người chơi
        io.emit('playerHealthUpdate', {
          id: playerId,
          health: players[playerId].health
        });
      }
    }
  });
  
  // Xóa bom khỏi mảng
  const bombIndex = bombs.findIndex(b => b.id === bomb.id);
  if (bombIndex !== -1) {
    bombs.splice(bombIndex, 1);
  }
}

// Khởi động máy chủ
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Máy chủ đang chạy ở cổng ${PORT}`);
  console.log(`Truy cập game qua địa chỉ LAN: http://YourIPAddress:${PORT}`);
  
  // Tạo chướng ngại vật khi khởi động server
  generateObstacles();
  
  // Bắt đầu hẹn giờ tạo bom
  console.log('Bắt đầu hẹn giờ tạo bom...');
  bombInterval = setInterval(spawnBomb, BOMB_INTERVAL);
  
  // Tạo bom đầu tiên sau 10 giây
  setTimeout(spawnBomb, 10000);
}); 