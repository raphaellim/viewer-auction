const fs = require("fs");
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
  bidUnit: 1000,
  duration: 60,
  endTime: null
};

let pendingUsers = {};
let approvedUsers = {};

try {
  approvedUsers = JSON.parse(
    fs.readFileSync("approvedUsers.json", "utf8")
  );
} catch (e) {
  approvedUsers = {};
}
let blockedUsers = {};
let bidLogs = [];

function getRemainingTime() {
  if (!auction.isRunning || !auction.endTime) return 0;

  const remaining = Math.max(
    0,
    Math.ceil((auction.endTime - Date.now()) / 1000)
  );

  if (remaining <= 0) {
    auction.isRunning = false;
    auction.endTime = null;
  }

  return remaining;
}

function saveApprovedUsers() {
  fs.writeFileSync(
    "approvedUsers.json",
    JSON.stringify(approvedUsers, null, 2)
  );
}

function sendState() {
  io.emit("state", {
    auction,
    remainingTime: getRemainingTime(),
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

    if (!auction.isRunning) {
      socket.emit("bidResult", "경매가 아직 시작되지 않았거나 종료되었습니다.");
      return;
    }

    if (!approvedUsers[nickname]) {
      socket.emit("bidResult", "아직 관리자의 승인을 받지 않았습니다.");
      return;
    }

    if (blockedUsers[nickname]) {
      socket.emit("bidResult", "차단된 참여자입니다.");
      return;
    }

    if (!amount || amount <= auction.currentPrice) {
      socket.emit("bidResult", "현재가보다 높은 금액을 입력하세요.");
      return;
    }

    if (amount % auction.bidUnit !== 0) {
      socket.emit(
        "bidResult",
        `${auction.bidUnit.toLocaleString()}원 단위로 입찰해야 합니다.`
      );
      return;
    }

    auction.currentPrice = amount;
    auction.highestBidder = nickname;

    const remaining = getRemainingTime();

if (remaining > 0 && remaining <= 10) {
  auction.endTime += 10 * 1000;
}

    bidLogs.unshift({
      nickname,
      amount,
      time: new Date().toLocaleTimeString("ko-KR")
    });

    bidLogs = bidLogs.slice(0, 20);

    socket.emit("bidResult", "입찰 완료!");
    sendState();
  });

  socket.on("adminUpdate", (data) => {
    auction.itemName = data.itemName || auction.itemName;
    auction.startPrice = Number(data.startPrice) || auction.startPrice;
    auction.currentPrice = auction.startPrice;
    auction.highestBidder = "";
    auction.code = data.code || auction.code;
    auction.bidUnit = Number(data.bidUnit) || auction.bidUnit;
    auction.duration = Number(data.duration) || auction.duration;
    auction.endTime = null;
    auction.isRunning = false;
    bidLogs = [];

    sendState();
  });

  socket.on("startAuction", () => {
    auction.isRunning = true;
    auction.endTime = Date.now() + auction.duration * 1000;
    sendState();
  });

  socket.on("endAuction", () => {
    auction.isRunning = false;
    auction.endTime = null;
    sendState();
  });

  socket.on("approveUser", (nickname) => {
    if (pendingUsers[nickname]) {
      approvedUsers[nickname] = pendingUsers[nickname];
      saveApprovedUsers();
      delete pendingUsers[nickname];
    }
    sendState();
  });

  socket.on("blockUser", (nickname) => {
    blockedUsers[nickname] = true;
    delete pendingUsers[nickname];
    delete approvedUsers[nickname];
    saveApprovedUsers();
    sendState();
  });

  socket.on("resetUsers", () => {
    pendingUsers = {};
    approvedUsers = {};
    saveApprovedUsers();
    blockedUsers = {};
    sendState();
  });
});

setInterval(() => {
  sendState();
}, 1000);

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(`경매 서버 실행 : ${PORT}`);
});
