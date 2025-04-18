# Game Đơn Giản Chơi Qua Mạng LAN

Đây là một game đơn giản cho phép nhiều người chơi di chuyển nhân vật của mình trên cùng một bản đồ thông qua mạng LAN.

## Cách cài đặt

1. Đảm bảo bạn đã cài đặt [Node.js](https://nodejs.org/)
2. Clone hoặc tải repository về
3. Mở terminal trong thư mục dự án và chạy:

```
npm install
```

## Cách chạy game

1. Trong thư mục dự án, chạy lệnh sau để khởi động máy chủ:

```
npm start
```

2. Máy chủ sẽ khởi động ở cổng 3000
3. Để tìm địa chỉ IP của bạn trong mạng LAN (Windows), hãy mở Command Prompt và gõ:

```
ipconfig
```

4. Tìm giá trị "IPv4 Address" trong phần adapter mạng của bạn (thường là 192.168.x.x)

5. Truy cập game thông qua trình duyệt:
   - Trên máy chủ: `http://localhost:3000`
   - Trên các máy khác trong cùng mạng LAN: `http://[Địa chỉ IP máy chủ]:3000`

## Cách chơi

- Mỗi người chơi sẽ được đại diện bởi một hình tròn có màu khác nhau
- Sử dụng các phím mũi tên ⬆️ ⬇️ ⬅️ ➡️ để di chuyển nhân vật của bạn
- Nhân vật của bạn được đánh dấu là "Bạn", các người chơi khác được đánh dấu với mã số ngắn

## Yêu cầu kỹ thuật

- Tất cả các máy tính phải kết nối cùng một mạng LAN
- Tường lửa của máy chủ phải cho phép kết nối đến cổng 3000
#   n o d e j s - t a n k - g a m e  
 