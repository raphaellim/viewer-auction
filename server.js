const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static("public"));

let auction = {
  itemName: "빵떠기 귤청",
  startPrice: 10000,
  currentPrice: 10000,
  highestBidder: "",
  isRunning: false,
  code: "TTEOGI",
  bidUnit: 1000
};

let pendingUsers = {};
let approvedUsers = {};
let blockedUsers = {};
let bidLogs = [];

function sendState() {
  io.emit("state", {
    auction,
    pendingUsers,
    approvedUsers,
    blockedUsers,
    bidLogs
  });
}

io.on("connection", (socket) => {
  sendState();

  socket.on("join", ({ nickname, code }) => {
    if (!nickname || !code) return;

    if (blockedUsers[nickname]) {
      socket.emit("joinResult", {
        ok: false,
        message: "차단된 닉네임입니다."
      });
      return;
    }

    if (code !== auction.code) {
      socket.emit("joinResult", {
        ok: false,
        message: "참여코드가 틀렸습니다."
      });
      return;
    }

    pendingUsers[nickname] = {
      nickname,
      socketId: socket.id
    };

    socket.nickname = nickname;

    socket.emit("joinResult", {
      ok: true,
      message: "참여 대기 중입니다. 관리자의 승인을 기다려주세요."
    });

    sendState();
  });

  socket.on("bid", ({ nickname, amount }) => {
    amount = Number(amount);

    if (!auction.isRunning) return;
    if (!approvedUsers[nickname]) return;
    if (blockedUsers[nickname]) return;
    if (!amount || amount <= auction.currentPrice) return;
    if (amount % auction.bidUnit !== 0) return;

    auction.currentPrice = amount;
    auction.highestBidder = nickname;

    bidLogs.unshift({
      nickname,
      amount,
      time: new Date().toLocaleTimeString("ko-KR")
    });

    bidLogs = bidLogs.slice(0, 20);

    sendState();
  });

  socket.on("adminUpdate", (data) => {
    auction.itemName = data.itemName || auction.itemName;
    auction.startPrice = Number(data.startPrice) || auction.startPrice;
    auction.currentPrice = auction.startPrice;
    auction.highestBidder = "";
    auction.code = data.code || auction.code;
    auction.bidUnit = Number(data.bidUnit) || auction.bidUnit;
    bidLogs = [];
    sendState();
  });

  socket.on("startAuction", () => {
    auction.isRunning = true;
    sendState();
  });

  socket.on("endAuction", () => {
    auction.isRunning = false;
    sendState();
  });

  socket.on("approveUser", (nickname) => {
    if (pendingUsers[nickname]) {
      approvedUsers[nickname] = pendingUsers[nickname];
      delete pendingUsers[nickname];
    }
    sendState();
  });

  socket.on("blockUser", (nickname) => {
    blockedUsers[nickname] = true;
    delete pendingUsers[nickname];
    delete approvedUsers[nickname];
    sendState();
  });

  socket.on("resetUsers", () => {
    pendingUsers = {};
    approvedUsers = {};
    blockedUsers = {};
    sendState();
  });
});

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`경매 서버 실행 : ${PORT}`);
});
