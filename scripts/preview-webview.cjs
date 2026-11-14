const http = require('http');
const fs = require('fs');
const { createChatViewHtml } = require(process.cwd() + '/out/chatViewHtml.js');
http.createServer((req,res) => {
 if(req.url === '/effects.js') {res.setHeader('Content-Type','text/javascript'); res.end(fs.readFileSync('out/effects.js'));return;}
 const html = createChatViewHtml('/effects.js');
 const nonce = html.match(/nonce="([^"]+)"/)[1];
 const mock = `<script nonce="${nonce}">window.sent=[];let saved={};window.acquireVsCodeApi=()=>({postMessage:m=>window.sent.push(m),getState:()=>saved,setState:s=>saved=s});</script>`;
 const style = `<style>:root{--vscode-font-size:13px;--vscode-font-family:system-ui;--vscode-foreground:#d9e1ee;--vscode-descriptionForeground:#8c9ab0;--vscode-sideBar-background:#10151e;--vscode-input-background:#171f2c;--vscode-input-foreground:#e2e8f0;--vscode-input-placeholderForeground:#8491a5;--vscode-button-background:#235d9e;--vscode-button-foreground:#ffffff;--vscode-widget-border:#28364a;--vscode-focusBorder:#65a8ed;--vscode-textLink-foreground:#86bbf0;--vscode-chat-requestBackground:#1b2738;--vscode-errorForeground:#ff8b8b;}</style>`;
 res.setHeader('Content-Type','text/html');res.end(html.replace('</head>',style+mock+'</head>'));
}).listen(4180,'127.0.0.1');
