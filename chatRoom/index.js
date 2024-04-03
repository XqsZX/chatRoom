const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path'); // 确保你有这行来引入path模块
const fileUpload = require('express-fileupload');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);
app.use(fileUpload());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// key is room name and value is the password
const rooms = {};

// key is room name and value is users in it
const roomUsers = {};
const roomAdmins = {};
const bannedUsers = {};
const userSockets = {};
const UPLOAD_DIR = path.join(__dirname, '/uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// 设置静态文件目录
app.use(express.static('public'));

// 定义路由，这里只设置了根路径
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 处理文件上传的路由
app.post('/upload', (req, res) => {
  const uploader = req.body.username;
  const roomName = req.body.roomName;
  if (!req.files) {
    return res.status(400).send('No files were uploaded.');
  }

  let uploadedFiles = req.files.files; // 这里的 'files' 对应前端 formData.append 的第一个参数
  if (!Array.isArray(uploadedFiles)) {
    uploadedFiles = [uploadedFiles];
  }

  let uploadedFileUrls = [];

  uploadedFiles.forEach(file => {
    // 使用日期时间确保文件名唯一
    const filename = Date.now() + '-' + file.name;
    const savePath = path.join(UPLOAD_DIR, filename);

    // 使用 mv() 方法来保存文件到服务器文件系统
    file.mv(savePath, err => {
      if (err) {
        return res.status(500).send(err);
      }
    });

    // 构建文件的URL
    const fileUrl = `/uploads/${filename}`;
    io.to(roomName).emit('new message', {
      user: uploader,
      text: `uploaded a file: `,
      fileUrl: fileUrl,
      fileName: file.name
    });

    res.json({ message: 'Files uploaded successfully.' });
  });
});

// 为上传的文件提供静态文件服务
app.use('/uploads', express.static(UPLOAD_DIR));

// 当有新的客户端连接时，打印一条消息
io.on('connection', (socket) => {
  console.log('A user connected');
  let curUser = '';

  socket.on('set username', (name) => {
    console.log('Set username:', name);
    curUser = name;
    userSockets[name] = socket.id;
  });

  socket.on('private message', ({ roomName, toUsername, message }) => {
    if (roomUsers[roomName] && roomUsers[roomName].includes(toUsername)) {
      const toSocketId = userSockets[toUsername];
      if (toSocketId) {
        io.to(toSocketId).emit('private message', { from: curUser, message });
      }
    }
  });

  // 踢人
  socket.on('kick user', (roomName, usernameToKick) => {
    if (roomAdmins[roomName] === curUser && usernameToKick !== curUser) { // 确保房间创建者不能被踢
      const socketId = userSockets[usernameToKick];
      if (socketId) {
        io.to(socketId).emit('kicked', roomName);
        io.sockets.sockets.get(socketId).leave(roomName); // 让用户离开房间

        if (roomUsers[roomName]) {
          roomUsers[roomName] = roomUsers[roomName].filter(user => user !== usernameToKick);
          io.to(roomName).emit('update user list', roomUsers[roomName]);
        }
      }
    }
  });

  // 封禁
  socket.on('ban user', (roomName, usernameToBan) => {
    if (roomAdmins[roomName] === curUser && usernameToBan !== curUser) {
      if (!bannedUsers[roomName]) {
        bannedUsers[roomName] = [];
      }
      bannedUsers[roomName].push(usernameToBan);
      const socketId = userSockets[usernameToBan];
      if (socketId) {
        io.to(socketId).emit('banned', roomName);
        io.sockets.sockets.get(socketId).leave(roomName); // 断开连接，自动离开房间

        if (roomUsers[roomName]) {
          roomUsers[roomName] = roomUsers[roomName].filter(user => user !== usernameToBan);
          io.to(roomName).emit('update user list', roomUsers[roomName]);
        }
      }
    }
  });

  // 处理创建房间的请求
  socket.on('create room', (roomName, password) => {
    if (rooms[roomName]) {
      socket.emit('room exists', roomName);
    } else {
      rooms[roomName] = password || '';
      roomAdmins[roomName] = curUser;
      socket.join(roomName);
      // 添加用户到房间用户列表
      if (!roomUsers[roomName]) {
        roomUsers[roomName] = [];
      }
      roomUsers[roomName].push(curUser);
      socket.emit('room created', roomName);
      socket.emit('update role', { isAdmin: true });
      // 通知房间内的所有用户更新用户列表
      io.to(roomName).emit('update user list', roomUsers[roomName]);
    }
  });

  // 发送消息到房间
  socket.on('send message', (roomName, message) => {
    // 新增：检查用户是否被封禁
    if (bannedUsers[roomName] && bannedUsers[roomName].includes(curUser)) {
      socket.emit('message not sent', 'You are banned from this room.');
      return;
    }
    io.to(roomName).emit('new message', { user: curUser, text: message });
  });

  // 处理加入房间的请求
  socket.on('join room', (roomName, password) => {
    if (bannedUsers[roomName] && bannedUsers[roomName].includes(curUser)) {
      socket.emit('banned');
      return;
    }
    if (rooms[roomName] && rooms[roomName] === password) {
      socket.join(roomName);
      // 添加用户到房间用户列表
      if (!roomUsers[roomName]) {
        roomUsers[roomName] = [];
      }
      roomUsers[roomName].push(curUser);
      socket.emit('joined room', roomName);
      const isAdmin = roomAdmins[roomName] === curUser;
      socket.emit('update role', { isAdmin: isAdmin });
      // 通知房间内的所有用户更新用户列表
      io.to(roomName).emit('update user list', roomUsers[roomName]);
    } else if (rooms[roomName] && rooms[roomName] !== password) {
      socket.emit('incorrect password', roomName);
    } else {
      socket.emit('room does not exist', roomName);
    }
  });

  socket.on('leave room', (roomName) => {
    socket.leave(roomName);
    if (roomUsers[roomName]) {
      roomUsers[roomName] = roomUsers[roomName].filter(user => user !== curUser);
      io.to(roomName).emit('update user list', roomUsers[roomName]);
    }
  });

  // 当连接断开时，打印一条消息
  socket.on('disconnect', () => {
    console.log('User disconnected: ', curUser);
    // 遍历所有房间移除用户
    Object.keys(roomUsers).forEach(room => {
      roomUsers[room] = roomUsers[room].filter(user => user !== curUser);
      if (roomUsers[room].length === 0) {
        // 如果房间没人了，删除房间
        delete rooms[room];
      } else {
        // 通知房间内的所有用户更新用户列表
        io.to(room).emit('update user list', roomUsers[room]);
      }
    });
    delete userSockets[curUser];
  });
});

const PORT = process.env.PORT || 3456;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
