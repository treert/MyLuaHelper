/* eslint-disable */
'use strict';

import * as vscode from 'vscode';
import * as path from "path";
import * as net from "net";
import * as process from "process";
import * as child_process from "child_process";
import * as Annotator from "./annotator";
import * as notifications from "./notifications";
import * as os from 'os';
import * as mydebuger from './debug/mydebuger';
//import { LanguageClient, LanguageClientOptions, ServerOptions, StreamInfo } from "vscode-languageclient";
import { LuaLanguageConfiguration } from './languageConfiguration';
import { Tools } from './common/tools';
import { DebugLogger } from './common/logManager';
// import { LuaConfigurationProvider } from './luapandaDebug';
import { LuaFormatRangeProvider, LuaFormatProvider } from "./luaformat";
// import { OnlinePeople } from './onlinePeople';


import {
    LanguageClient,
    LanguageClientOptions,
    PositionEncodingKind,
    ServerOptions,
    StreamInfo,
} from 'vscode-languageclient/node';
import { StatusBarManager } from './common/statusBarManager';
import { PathManager } from './common/pathManager';

let luadoc = require('../client/3rd/vscode-lua-doc/extension.js');

const LANGUAGE_ID = 'lua';

export let savedContext: vscode.ExtensionContext;
let client: LanguageClient;
let activeEditor: vscode.TextEditor;
// let onlinePeople = new OnlinePeople();

export function activate(context: vscode.ExtensionContext) {
    Tools.context = context;

    let luaDocContext = {
        ViewType: undefined,
        OpenCommand: undefined,
        extensionPath: undefined,
    };

    for (const k in context) {
        try {
            luaDocContext[k] = context[k];
        } catch (error) { }
    }
    luaDocContext.ViewType = 'luahelper-doc';
    luaDocContext.OpenCommand = 'extension.luahelper.doc';
    luaDocContext.extensionPath = context.extensionPath + '/client/3rd/vscode-lua-doc';

    luadoc.activate(luaDocContext);

    console.log("luahelper actived!");
    savedContext = context;
    savedContext.subscriptions.push(vscode.languages.registerDocumentFormattingEditProvider({ scheme: "file", language: LANGUAGE_ID },
        new LuaFormatProvider(context)));
    savedContext.subscriptions.push(vscode.languages.registerDocumentRangeFormattingEditProvider({ scheme: "file", language: LANGUAGE_ID },
        new LuaFormatRangeProvider(context)));

    savedContext.subscriptions.push(vscode.workspace.onDidChangeTextDocument(onDidChangeTextDocument, null, savedContext.subscriptions));
    savedContext.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(onDidChangeActiveTextEditor, null, savedContext.subscriptions));

    // 注册了LuaPanda的调试功能
    // const provider = new LuaConfigurationProvider();
    // savedContext.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('LuaHelper-Debug', provider));
    // savedContext.subscriptions.push(provider);

    // 插入快捷拷贝调试文件的命令   
    savedContext.subscriptions.push(vscode.commands.registerCommand("LuaHelper.copyDebugFile", copyDebugFile));
    // 插入快捷拷贝luasocket的命令   
    savedContext.subscriptions.push(vscode.commands.registerCommand("LuaHelper.copyLuaSocket", copyLuaSocket));
    // 插入快捷输入调试的命令   
    savedContext.subscriptions.push(vscode.commands.registerCommand("LuaHelper.insertDebugCode", insertDebugCode));
    // 打开调试文件夹
    savedContext.subscriptions.push(vscode.commands.registerCommand("LuaHelper.openDebugFolder", openDebugFolder));
    // 设置格式化配置
    savedContext.subscriptions.push(vscode.commands.registerCommand("LuaHelper.setFormatConfig", setFormatConfig));

    savedContext.subscriptions.push(vscode.languages.setLanguageConfiguration("lua", new LuaLanguageConfiguration()));


    // init log
    DebugLogger.init();
    StatusBarManager.init();
    PathManager.init();

    // 公共变量赋值
    let pkg = require(context.extensionPath + "/package.json");
    Tools.adapterVersion = pkg.version;
    Tools.VSCodeExtensionPath = context.extensionPath;

    StatusBarManager.ShowMain('💚mylua');

    vscode.workspace.onDidChangeWorkspaceFolders(_event => {
        // 在工程中增删文件夹的回调
        console.log('Workspace folder change event received.');
        if (_event.added.length > 0) {
            PathManager.addOpenedFolder(_event.added);
        }

        if (_event.removed.length > 0) {
            PathManager.removeOpenedFolder(_event.removed);
        }
    });

    startServer();

    mydebuger.activate(context);
}

exports.activate = activate;

// 获取相应的告警配置开关，返回true或false
function getWarnCheckFlag(str: string): boolean {
    let checkFlagConfig = vscode.workspace.getConfiguration("luahelper.Warn", null).get(str);
    var checkFlag = false;
    if (checkFlagConfig !== undefined) {
        checkFlag = <boolean><any>checkFlagConfig;
    }
    return checkFlag;
}

function onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent) {
    if (activeEditor && activeEditor.document === event.document && activeEditor.document.languageId === LANGUAGE_ID
        && client) {
        Annotator.requestAnnotators(activeEditor, client);
    }
}

function onDidChangeActiveTextEditor(editor: vscode.TextEditor | undefined) {
    if (editor && editor.document.languageId === LANGUAGE_ID && client) {
        activeEditor = editor as vscode.TextEditor;
        Annotator.requestAnnotators(activeEditor, client);
    }
}

export function deactivate() {
    vscode.window.showInformationMessage("deactivate");
    stopServer();
    mydebuger.deactivate();
}

async function startServer() {
    let showConfig = vscode.workspace.getConfiguration("luahelper.base", null).get("showCostTime");
    var openFlag = false;
    if (showConfig !== undefined) {
        openFlag = <boolean><any>showConfig;
    }

    let begin_time = Date.now();
    doStartServer().then(() => {
        if (openFlag === true) {
            let end_time = Date.now();
            let cost_ms = end_time - begin_time;
            let second = Math.floor(cost_ms / 1000);
            let ms = Math.floor(cost_ms % 1000 / 100);
            let str_cost_time: string = String(second) + "." + String(ms) + "s";
            vscode.window.showInformationMessage("start luahelper ok, cost time: " + str_cost_time);
        }
        onDidChangeActiveTextEditor(vscode.window.activeTextEditor);
        // onlinePeople.Start(client);

    })
        .catch(reson => {
            vscode.window.showInformationMessage(`start luahelper failed, reason: ${reson}`);
            // vscode.window.showErrorMessage(`${reson}`, "Try again").then(startServer);
        });
}

// mac目录赋予可执行权限
function changeExMod() {
    try {
        if (process.platform === "darwin" || process.platform === "linux") {
            var vscodeRunStr: string = path.resolve(savedContext.extensionPath, "server");
            // 赋予可执行权限
            let cmdExeStr = "chmod -R +x " + vscodeRunStr;
            child_process.execSync(cmdExeStr);
        }
    } catch (e) {
        //捕获异常
        console.log("exception");
        vscode.window.showInformationMessage("chmod error");
    }
}

async function doStartServer() {
    changeExMod();

    let lspConfig = vscode.workspace.getConfiguration("luahelper.base", null).get("lsp");
    var lspStr: string = "cmd rpc";
    if (lspConfig !== undefined) {
        lspStr = <string><any>lspConfig;
    }

    let requirePathSeparatorConfig = vscode.workspace.getConfiguration("luahelper.base", null).get("requirePathSeparator");
    var requirePathSeparator: string = ".";
    if (lspConfig !== undefined) {
        requirePathSeparator = <string><any>requirePathSeparatorConfig;
    }

    let lspLogConfig = vscode.workspace.getConfiguration("luahelper.base", null).get("lspserverLog");
    var lspLogFlag = false;
    if (lspLogConfig !== undefined) {
        lspLogFlag = <boolean><any>lspLogConfig;
    }

    let enableReportConfig = vscode.workspace.getConfiguration("luahelper.base", null).get("report");
    var enableReportFlag = false;
    if (enableReportConfig !== undefined) {
        enableReportFlag = <boolean><any>enableReportConfig;
    }

    // 定义所有的监控文件后缀的关联
    var filesWatchers: vscode.FileSystemWatcher[] = new Array<vscode.FileSystemWatcher>();
    filesWatchers.push(vscode.workspace.createFileSystemWatcher("**/*.lua"));

    // 获取其他文件关联为lua的配置
    let fileAssociationsConfig = vscode.workspace.getConfiguration("files.associations", null);
    if (fileAssociationsConfig !== undefined) {
        for (const key of Object.keys(fileAssociationsConfig)) {
            if (fileAssociationsConfig.hasOwnProperty(key)) {
                let strValue = <string><any>fileAssociationsConfig[key];
                if (strValue === "lua") {
                    // 如果映射为lua文件
                    filesWatchers.push(vscode.workspace.createFileSystemWatcher("**/" + key));
                }
            }
        }
    }

    let ignoreFileOrDirArr: string[] | undefined = vscode.workspace.getConfiguration("luahelper.base", null).get("ignoreFileOrDir");
    let ignoreFileOrDirErrArr: string[] | undefined = vscode.workspace.getConfiguration("luahelper.base", null).get("ignoreFileOrDirError");

    const clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: LANGUAGE_ID }],
        synchronize: {
            configurationSection: ["luahelper", "files.associations"],
            fileEvents: filesWatchers,
        },
        initializationOptions: {
            client: 'vsc',
            PluginPath: savedContext.extensionPath,
            FileAssociationsConfig: fileAssociationsConfig,
            AllEnable: getWarnCheckFlag("AllEnable"),
            CheckSyntax: getWarnCheckFlag("CheckSyntax"),
            CheckNoDefine: getWarnCheckFlag("CheckNoDefine"),
            CheckAfterDefine: getWarnCheckFlag("CheckAfterDefine"),
            CheckLocalNoUse: getWarnCheckFlag("CheckLocalNoUse"),
            CheckTableDuplicateKey: getWarnCheckFlag("CheckTableDuplicateKey"),
            CheckReferNoFile: getWarnCheckFlag("CheckReferNoFile"),
            CheckAssignParamNum: getWarnCheckFlag("CheckAssignParamNum"),
            CheckLocalDefineParamNum: getWarnCheckFlag("CheckLocalDefineParamNum"),
            CheckGotoLable: getWarnCheckFlag("CheckGotoLable"),
            CheckFuncParam: getWarnCheckFlag("CheckFuncParam"),
            CheckImportModuleVar: getWarnCheckFlag("CheckImportModuleVar"),
            CheckIfNotVar: getWarnCheckFlag("CheckIfNotVar"),
            CheckFunctionDuplicateParam: getWarnCheckFlag("CheckFunctionDuplicateParam"),
            CheckBinaryExpressionDuplicate: getWarnCheckFlag("CheckBinaryExpressionDuplicate"),
            CheckErrorOrAlwaysTrue: getWarnCheckFlag("CheckErrorOrAlwaysTrue"),
            CheckErrorAndAlwaysFalse: getWarnCheckFlag("CheckErrorAndAlwaysFalse"),
            CheckNoUseAssign: getWarnCheckFlag("CheckNoUseAssign"),
            CheckAnnotateType: getWarnCheckFlag("CheckAnnotateType"),
            CheckDuplicateIf: getWarnCheckFlag("CheckDuplicateIf"),
            CheckSelfAssign: getWarnCheckFlag("CheckSelfAssign"),
            CheckFloatEq: getWarnCheckFlag("CheckFloatEq"),
            CheckClassField: getWarnCheckFlag("CheckClassField"),
            CheckConstAssign: getWarnCheckFlag("CheckConstAssign"),
            CheckFuncParamType: getWarnCheckFlag("CheckFuncParamType"),
            CheckFuncReturnType: getWarnCheckFlag("CheckFuncReturnType"),
            IgnoreFileOrDir: ignoreFileOrDirArr,
            IgnoreFileOrDirError: ignoreFileOrDirErrArr,
            RequirePathSeparator: requirePathSeparator,
            EnableReport: enableReportFlag,
            // 这是 Language Server Protocol 规定在 initialize 请求中客户端发送的 capabilities.general.positionEncodings
            // 你可以尝试在这里明确声明客户端支持 UTF-32
            capabilities: {
                general: {
                    positionEncodings: [
                        PositionEncodingKind.UTF16, // 总是优先支持 UTF-16
                        PositionEncodingKind.UTF32, // 添加 UTF-32
                        PositionEncodingKind.UTF8,  // 添加 UTF-8
                    ]
                }
            },
        },
        markdown: {
            isTrusted: true,
        }
    };

    var DEBUG_MODE = process.env['DEBUG_MODE'] === "true";
    if (lspStr !== "cmd rpc") {
        DEBUG_MODE = true;
    }

    // 调试模式，通过socket链接lsp后台程序
    if (DEBUG_MODE) {
        const connectionInfo = {
            host: "localhost",
            port: 7778
        };

        let serverOptions: ServerOptions;
        serverOptions = () => {
            // Connect to language server via socket
            let socket = net.connect(connectionInfo);
            let result: StreamInfo = {
                writer: socket,
                reader: socket as NodeJS.ReadableStream
            };

            socket.on("close", () => {
                vscode.window.showInformationMessage("luahelper connect close");
                console.log("client connect error!");
            });
            return Promise.resolve(result);
        };

        client = new LanguageClient(LANGUAGE_ID, "luahelper plugin for vscode.", serverOptions, clientOptions);

        await client.start();  // 直接 await start() 方法
        // savedContext.subscriptions.push({ dispose: () => client.stop() }); // 停止时清理
        // savedContext.subscriptions.push(client.start());
        // await client.onReady();
    } else {
        let cp: string = "";
        let platform: string = os.platform();
        switch (platform) {
            case "win32":
                cp = path.resolve(savedContext.extensionPath, "server", "lualsp.exe");
                break;
            case "linux":
                cp = path.resolve(savedContext.extensionPath, "server", "linuxlualsp");
                break;
            case "darwin":
                if (process.arch === "arm64") {
                    cp = path.resolve(savedContext.extensionPath, "server", "armmaclualsp");
                } else {
                    cp = path.resolve(savedContext.extensionPath, "server", "maclualsp");
                }
                break;
        }

        if (cp === "") {
            return;
        }

        let serverOptions: ServerOptions;

        //cp = cp + "/luachecklsp.exe";
        let logSetStr = "-logflag=0";
        if (lspLogFlag === true) {
            logSetStr = "-logflag=1";
        }

        serverOptions = {
            command: cp,
            args: ["-mode=1", logSetStr]
        };

        client = new LanguageClient(LANGUAGE_ID, "luahelper plugin for vscode.", serverOptions, clientOptions);
        await client.start();  // 直接 await start() 方法
        // savedContext.subscriptions.push({ dispose: () => client.stop() }); // 停止时清理
        // savedContext.subscriptions.push(client.start());
        // await client.onReady();
    }

    client.onNotification("luahelper/progressReport", (d: notifications.IProgressReport) => {
        StatusBarManager.ShowMain(d.text, d.state === 2 ? 3000 : 0);
    });
}

function stopServer() {
    if (client && client.isRunning()) {
        client.stop();
    }
}

async function insertDebugCode() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }
    const document = activeEditor.document;
    if (document.languageId !== 'lua') {
        return;
    }

    console.log(os.arch());

    const ins = new vscode.SnippetString();
    //ins.appendText(`\n`);
    ins.appendText(`require("LuaPanda").start("127.0.0.1", 8818);`);
    //ins.appendText(`\n`);
    activeEditor.insertSnippet(ins);
}

async function copyDebugFile() {
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        return;
    }

    let rootPathStr = vscode.workspace.workspaceFolders[0].uri;

    const arch = await vscode.window.showOpenDialog({
        defaultUri: rootPathStr,
        openLabel: "add debug file",
        canSelectFolders: true,
        canSelectMany: false,
    });

    if (!arch || !arch.length) {
        console.log("not select dst director");
        return;
    }

    let pathArr = Tools.VSCodeExtensionPath.split(path.sep);
    let srcPath = pathArr.join('/');
    srcPath = srcPath + "/debugger/LuaPanda.lua";

    let selectDstPath = arch[0];
    let dstPath = selectDstPath.fsPath + "/LuaPanda.lua";
    try {
        if (process.platform === "win32") {
            srcPath = pathArr.join('\\');
            srcPath = srcPath + "\\debugger\\LuaPanda.lua";

            dstPath = selectDstPath.fsPath + "\\LuaPanda.lua";
            let cmdStr = "copy " + srcPath + " " + dstPath + "/Y";
            console.log("cmdStr:%s", cmdStr);
            child_process.execSync(cmdStr);
            vscode.window.showInformationMessage("copy lua debug file success.");
        } else if (process.platform === "darwin") {

            let cmdStr = "cp -R " + srcPath + dstPath;
            console.log("cmdStr:%s", cmdStr);
            child_process.execSync(cmdStr);
            vscode.window.showInformationMessage("copy lua debug file success.");
        } else if (process.platform === "linux") {
            let cmdStr = "cp -a " + srcPath + dstPath;
            console.log("cmdStr:%s", cmdStr);
            child_process.execSync(cmdStr);
            vscode.window.showInformationMessage("copy lua debug file success.");
        }
    } catch (e) {
        //捕获异常
        console.log("exception", e);
    }
}

async function copyLuaSocket() {
    const arr = [{
        label: 'lua5.1',
        description: 'lua lib version',
        picked: false
    }, {
        label: 'lua5.2',
        description: 'lua lib version',
        picked: false
    }, {
        label: 'lua5.3',
        description: 'lua lib version',
        picked: false
    }, {
        label: 'lua5.4',
        description: 'lua lib version',
        picked: true,
    }];

    let strTitle: string = "Please select the lua version to copy luasocket"

    if (vscode.env.language === "zh-cn" || vscode.env.language === "zh-tw") {
        strTitle = "请选择要拷贝luasocket的lua版本";
    }
    let selectWord = await vscode.window.showQuickPick(arr, {
        placeHolder: strTitle,
    });

    console.log(selectWord.label);

    let rootPathStr = vscode.workspace.workspaceFolders[0].uri;
    const arch = await vscode.window.showOpenDialog({
        defaultUri: rootPathStr,
        openLabel: "copy luasocket",
        canSelectFolders: true,
        canSelectMany: false,
    });

    if (!arch || !arch.length) {
        console.log("not select dst director");
        return;
    }

    let selectDstPath = arch[0];
    let dstPath = selectDstPath.fsPath;
    let srcCopyDir: string = "";
    try {
        if (process.platform === "win32") {
            srcCopyDir = path.join(Tools.VSCodeExtensionPath, '/debugger/luasocket/win/x64/' + selectWord.label + "/socket");
            let cmdStr1 = "xcopy " + srcCopyDir + " " + dstPath + "\\socket\\" + " /S /Y";
            console.log("cmdStr:%s", cmdStr1);
            child_process.execSync(cmdStr1);

            srcCopyDir = path.join(Tools.VSCodeExtensionPath, '/debugger/luasocket/win/x64/' + selectWord.label + "/mime");
            let cmdStr2 = "xcopy " + srcCopyDir + " " + dstPath + "\\mime\\" + " /S /Y";
            console.log("cmdStr:%s", cmdStr2);
            child_process.execSync(cmdStr2);

            vscode.window.showInformationMessage("copy lua socket " + selectWord.label + " lib success.");
        } else if (process.platform === "darwin") {
            srcCopyDir = path.join(Tools.VSCodeExtensionPath, '/debugger/luasocket/mac/' + selectWord.label + "/socket");
            let cmdStr1 = "cp -R " + srcCopyDir + " " + dstPath + "/";
            console.log("cmdStr:%s", cmdStr1);
            child_process.execSync(cmdStr1);

            srcCopyDir = path.join(Tools.VSCodeExtensionPath, '/debugger/luasocket/mac/' + selectWord.label + "/mime");
            let cmdStr2 = "cp -R " + srcCopyDir + " " + dstPath + "/";
            console.log("cmdStr:%s", cmdStr2);
            child_process.execSync(cmdStr2);

            vscode.window.showInformationMessage("copy lua socket " + selectWord.label + " lib success.");
        } else if (process.platform === "linux") {
            srcCopyDir = path.join(Tools.VSCodeExtensionPath, '/debugger/luasocket/linux/' + selectWord.label + "/socket");
            let cmdStr1 = "cp -a " + srcCopyDir + " " + dstPath + "/";
            console.log("cmdStr:%s", cmdStr1);
            child_process.execSync(cmdStr1);

            srcCopyDir = path.join(Tools.VSCodeExtensionPath, '/debugger/luasocket/linux/' + selectWord.label + "/mime");
            let cmdStr2 = "cp -a " + srcCopyDir + " " + dstPath + "/";
            console.log("cmdStr:%s", cmdStr2);
            child_process.execSync(cmdStr2);
            vscode.window.showInformationMessage("copy lua socket " + selectWord.label + " lib success.");
        }
    } catch (e) {
        //捕获异常
        console.log("exception", e);
    }
}

async function openDebugFolder() {
    let pathArr = Tools.VSCodeExtensionPath.split(path.sep);
    let srcPath = pathArr.join('/');
    let cmdExeStr = "";
    if (process.platform === "win32") {
        srcPath = pathArr.join('\\');
        cmdExeStr = "explorer " + srcPath + "\\" + "debugger";
    } else if (process.platform === "darwin") {
        cmdExeStr = "open  " + srcPath + "/debugger";
    } else if (process.platform === "linux") {
        cmdExeStr = "nautilus  " + srcPath + "/debugger";
    } else {
        return;
    }

    try {
        child_process.execSync(cmdExeStr);
    } catch (e) {
        console.log("exception");
    }
}

async function setFormatConfig() {
    var vscodeRunStr: string = path.resolve(savedContext.extensionPath, "server");
    let configPath = path.resolve(vscodeRunStr, "luafmt.config");

    try {
        await vscode.window.showTextDocument(vscode.Uri.file(configPath));
    } catch (e) {
        console.log("setFormatConfig exception");
    }
}
