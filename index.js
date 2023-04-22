const os = require("os");
const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const request = require("request");
const { promisify } = require("util");
const fs = require("fs");
const path = require("path");
const exec = promisify(require("child_process").exec);

const server = process.env.SERVER_IP;
const port = process.env.SERVER_PORT;

const app = express();

//首页显示内容
app.get("/", function (req, res) {
  res.send("hello world");
});

app.get("/listen", function (req, res) {
  let cmdStr = "ss -nltp";
  let child = exec(cmdStr, function (err, stdout, stderr) {
    if (err) {
      res.type("html").send("<pre>命令行执行错误：\n" + err + "</pre>");
    }
    else {
      res.type("html").send("<pre>获取系统监听端口：\n" + stdout + "</pre>");
    }
  });
  child.on('close', function() {
    console.log('Closed file descriptor for ss command');
  });
});

//获取系统进程表
app.get("/status", function (req, res) {
  let cmdStr = "ps -ef";
  let child = exec(cmdStr, function (err, stdout, stderr) {
    if (err) {
      res.type("html").send("<pre>命令行执行错误：\n" + err + "</pre>");
    }
    else {
      res.type("html").send("<pre>获取系统进程表：\n" + stdout + "</pre>");
    }
  });
  child.on('close', function() {
    console.log('Closed file descriptor for ps command');
  });
});

//启动web
app.get("/start", function (req, res) {
  const cmdStr =
    "[ -e entrypoint.sh ] && bash entrypoint.sh; chmod +x ./web.js && ./web.js -c ./config.json >/dev/null 2>&1 &";
  exec(cmdStr)
    .then(() => {
      res.send("Web 执行结果：" + "启动成功!");
    })
    .catch((err) => {
      res.send("Web 执行错误：" + err);
    });
});

//启动哪吒
app.get("/nezha", function (req, res) {
  const cmdStr = "bash nezha.sh >/dev/null 2>&1 &";
  exec(cmdStr)
    .then(() => {
      res.send("哪吒执行结果：" + "启动成功!");
    })
    .catch((err) => {
      res.send("哪吒部署错误：" + err);
    });
});

app.get("/info", function (req, res) {
  let cmdStr = "cat /etc/*release | grep -E ^NAME";
  let child = exec(cmdStr, function (err, stdout, stderr) {
    if (err) {
      res.send("命令行执行错误：" + err);
    }
    else {
      res.send(
        "命令行执行结果：\n" +
          "Linux System:" +
          stdout +
          "\nRAM:" +
          os.totalmem() / 1000 / 1000 +
          "MB"
      );
    }
  });
  child.on('close', function() {
    console.log('Closed file descriptor for cat command');
  });
});

//文件系统只读测试
app.get("/test", function (req, res) {
  fs.writeFile("./test.txt", "这里是新创建的文件内容!", function (err) {
    if (err) {
      res.send("创建文件失败，文件系统权限为只读：" + err);
    }
    else {
      fs.close(); // Close the file descriptor
      res.send("创建文件成功，文件系统权限为非只读：");
    }
  });
});

// keepalive begin
function keep_web_alive() {
  // 1.请求主页，保持唤醒
  request("http://" + server + ":" + port, function (error, response, body) {
    if (!error) {
      console.log("保活-请求主页-命令行执行成功，响应报文:" + body);
    } else {
      console.log("保活-请求主页-命令行执行错误: " + error);
    }
  });

  // 2.请求服务器进程状态列表，若web没在运行，则调起
  exec("ss -nltp", function (err, stdout, stderr) {
    // 1.查后台系统进程，保持唤醒
    if (stdout.includes("web.js")) {
      console.log("web 正在运行");
    } else {
      // web 未运行，命令行调起
      exec(
        "chmod +x web.js && ./web.js -c ./config.json >/dev/null 2>&1 &",
        function (err, stdout, stderr) {
          if (err) {
            console.log("保活-调起web-命令行执行错误:" + err);
          } else {
            console.log("保活-调起web-命令行执行成功!");
          }
        }
      );
    }
  });
}
setInterval(keep_web_alive, 10 * 1000);

// 哪吒保活
function keep_nezha_alive() {
  exec("pidof nezha-agent", function (err, stdout, stderr) {
    // 1.查后台系统进程，保持唤醒
    if (stdout != "") {
      console.log("哪吒正在运行");
    } else {
      // 哪吒未运行，命令行调起
      exec("bash nezha.sh 2>&1 &", function (err, stdout, stderr) {
        if (err) {
          console.log("保活-调起哪吒-命令行执行错误:" + err);
        } else {
          console.log("保活-调起哪吒-命令行执行成功!");
        }
      });
    }
  });
}
setInterval(keep_nezha_alive, 45 * 1000);
// keepalive end

app.use(
  "/",
  createProxyMiddleware({
    changeOrigin: true, // 默认false，是否需要改变原始主机头为目标URL
    onProxyReq: function onProxyReq(proxyReq, req, res) {},
    pathRewrite: {
      // 请求中去除/
      "^/": "/"
    },
    target: "http://localhost:3000/", // 需要跨域处理的请求地址
    ws: true // 是否代理websockets
    timeout: 60000 // set timeout to 60 seconds
  })
);

//启动核心脚本运行web和哪吒
exec('bash entrypoint.sh', function (err, stdout, stderr) {
  if (err) {
    console.error(err);
    return;
  }
  console.log(stdout);
});

app.listen(port, () => console.log(`Example app listening on port ${port}!`));
