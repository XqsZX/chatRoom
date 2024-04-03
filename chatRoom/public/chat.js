document.addEventListener('DOMContentLoaded', (event) => {
  const socket = io();
  let username = '';
  let currentRoom = '';
  let isRoomAdmin = false;

  const toggleDarkModeButton = document.getElementById('toggleDarkMode');
  toggleDarkModeButton.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
  });

  function showMainInterface() {
    document.getElementById('mainInterface').style.display = 'block'; // 显示主界面
    document.getElementById('chatInterface').style.display = 'none'; // 隐藏聊天界面
  }

  function showChatInterface() {
    document.getElementById('mainInterface').style.display = 'none'; // 隐藏主界面
    document.getElementById('chatInterface').style.display = 'block'; // 显示聊天界面
  }

  function leaveRoom() {
    socket.emit('leave room', currentRoom);
    showMainInterface();
  }

  function kickUser(username) {
    socket.emit('kick user', currentRoom, username);
  }

  function banUser(username) {
    socket.emit('ban user', currentRoom, username);
  }

  document.getElementById('connect').addEventListener('click', () => {
    username = document.getElementById('username').value;
    if (!username) {
      alert('Please enter a username.');
      return;
    }

    socket.emit('set username', username);
  });

  document.getElementById('createRoom').addEventListener('click', () => {
    const roomName = document.getElementById('roomName').value;
    const password = document.getElementById('roomPassword').value;
    socket.emit('create room', roomName, password);
  });

  document.getElementById('joinRoom').addEventListener('click', () => {
    if (!username) {
      alert('Please connect first.');
      return;
    }
    const roomName = document.getElementById('roomName').value;
    const password = document.getElementById('roomPassword').value;
    socket.emit('join room', roomName, password, username);
  });

  document.getElementById('leaveRoom').addEventListener('click', () => {
    const roomName = document.getElementById('roomName').value;
    leaveRoom(roomName);
  });

  document.getElementById('sendMessage').addEventListener('click', () => {
    const roomName = document.getElementById('roomName').value;
    const message = document.getElementById('messageInput').value;
    socket.emit('send message', roomName, message);
    document.getElementById('messageInput').value = ''; // 清空输入框
  });

  document.getElementById('sendPrivateMessage').addEventListener('click', () => {
    const recipient = document.getElementById('privateMsgRecipient').value;
    const message = document.getElementById('privateMessage').value;
    if (recipient && message) {
      socket.emit('private message', { roomName: currentRoom, toUsername: recipient, message });
      document.getElementById('privateMessage').value = '';
    }
  });

  document.getElementById('sendFile').addEventListener('click', () => {
    const files = document.getElementById('fileInput').files;
    if (files.length > 0) {
      // 使用FormData来封装文件数据
      const formData = new FormData();
      for (const file of files) {
        formData.append('files', file, file.name);
      }

      formData.append('username', username);
      formData.append('roomName', currentRoom);

      // 发送FormData到服务器
      fetch('/upload', { // 注意：这里的 '/upload' 是示例，您需要在服务器端设置对应的路由
        method: 'POST',
        body: formData,
      })
      .then(response => response.json())
      .then(data => {
        console.log(data.message);
        // 可以在这里处理上传后的行为，比如发送一个包含文件链接的消息到聊天室
      })
      .catch(error => {
        console.error('Error uploading files:', error);
      });
    }
  });

  document.getElementById('usernameInput').value = username;

  socket.on('new message', (data) => {
    const messagesList = document.getElementById('messages');
    const msgElement = document.createElement('li');
    // 如果消息包含文件链接，添加一个可下载的链接
    if (data.fileUrl) {
      const messageText = document.createTextNode(`${data.user} ${data.text} `);
      const downloadLink = document.createElement('a');
      downloadLink.href = data.fileUrl;
      downloadLink.textContent = data.fileName || 'Download file';
      downloadLink.target = '_blank';

      msgElement.appendChild(messageText);
      msgElement.appendChild(downloadLink);
    } else {
      msgElement.textContent = `${data.user}: ${data.text}`;
    }
      messagesList.appendChild(msgElement);
  });

  socket.on('private message', ({ from, message}) => {
    alert(`Private message from ${from}: ${message}`);
  });

  // 在这里处理用户被踢出房间
  socket.on('kicked', (room) => {
    if (currentRoom === room) {
      alert('You have been kicked out of the room.');
      showMainInterface();
      currentRoom = '';
    }
  });

  // 在这里处理用户被封禁
  socket.on('banned', (room) => {
    if (currentRoom === room) {
      alert('You have been banned from the room.');
      showMainInterface();
      currentRoom = '';
    }
  });

  socket.on('room created', (roomName) => {
    console.log(`Room ${roomName} created successfully.`);
    currentRoom = roomName;
    showChatInterface();
  });

  socket.on('update role', ({ isAdmin }) => {
    isRoomAdmin = isAdmin;
  });

  socket.on('joined room', (roomName) => {
    console.log(`Joined room ${roomName} successfully.`);
    currentRoom = roomName;
    showChatInterface();
  });

  socket.on('room exists', (roomName) => {
    console.log(`Room ${roomName} already exists.`);
  });

  socket.on('incorrect password', (roomName) => {
    console.log(`Incorrect password for room ${roomName}.`);
  });

  socket.on('room does not exist', (roomName) => {
    console.log(`Room ${roomName} does not exist.`);
  });

  socket.on('update user list', (users) => {
    const userList = document.getElementById('userList');
    userList.innerHTML = '';
    users.forEach(user => {
      const userElement = document.createElement('li');
      userElement.textContent = user;

      if (isRoomAdmin && user !== username) {
        const kickButton = document.createElement('button');
        kickButton.textContent = 'Kick';
        kickButton.onclick = () => kickUser(user);

        const banButton = document.createElement('button');
        banButton.textContent = 'Ban';
        banButton.onclick = () => banUser(user);

        userElement.appendChild(kickButton);
        userElement.appendChild(banButton);
      }

      userList.appendChild(userElement);
    });
  });
});
