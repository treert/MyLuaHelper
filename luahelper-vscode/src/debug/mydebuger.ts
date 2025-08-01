import * as vscode from "vscode";
import * as Net from 'net';
import { LuaDebugSession } from './luaDebug';
import { DebugLogger } from '../common/logManager';
import { Tools } from '../common/tools';

import { ExtensionContext } from 'vscode';
import { VisualSetting } from './visualSetting';
import { PathManager } from '../common/pathManager';

// debug启动时的配置项处理
class MyLuaConfigurationProvider implements vscode.DebugConfigurationProvider {
    private _server?: Net.Server;
    private static RunFileTerminal;
    resolveDebugConfiguration(folder: vscode.WorkspaceFolder | undefined, config: vscode.DebugConfiguration, token?: vscode.CancellationToken): vscode.ProviderResult<vscode.DebugConfiguration> {
        // if launch.json is missing or empty
        if (!config.type && !config.name) {
            const editor = vscode.window.activeTextEditor;
            if (editor && editor.document.languageId === 'lua') {
                vscode.window.showInformationMessage('请先正确配置launch文件!');
                config.type = 'lua';
                config.name = 'LuaPanda';
                config.request = 'launch';
            }
        }

        // 不调试而直接运行当前文件
        if(config.noDebug){
            // 获取活跃窗口
            let retObject = Tools.getVSCodeAvtiveFilePath();
            if( retObject["retCode"] !== 0 ){
                DebugLogger.DebuggerInfo(retObject["retMsg"]);
                return;
            }
            let filePath = retObject["filePath"];

            if(MyLuaConfigurationProvider.RunFileTerminal){
                MyLuaConfigurationProvider.RunFileTerminal.dispose();
            }
            MyLuaConfigurationProvider.RunFileTerminal = vscode.window.createTerminal({
                name: "Run Lua File (LuaPanda)",
                env: {}, 
            });

            // 把路径加入package.path
            let path = require("path");
            let pathCMD = "'";
            let pathArr = Tools.VSCodeExtensionPath.split( path.sep );
            let stdPath = pathArr.join('/');
            pathCMD = pathCMD + stdPath + "/Debugger/?.lua;"
            pathCMD = pathCMD + config.packagePath.join(';')
            pathCMD = pathCMD + "'";
            //拼接命令
            pathCMD = " \"package.path = " + pathCMD + ".. package.path;\" ";
            let doFileCMD =  filePath;
            let runCMD = pathCMD + doFileCMD;

            let LuaCMD;
            if(config.luaPath && config.luaPath !== ''){
                LuaCMD = config.luaPath + " -e "
            }else{
                LuaCMD = "lua -e ";
            }
            MyLuaConfigurationProvider.RunFileTerminal.sendText( LuaCMD + runCMD , true);
            MyLuaConfigurationProvider.RunFileTerminal.show();
            return ;
        }

        // 旧版本的launch.json中没有tag, 利用name给tag赋值
        if(config.tag == undefined){
            if(config.name === "LuaPanda"){
                config.tag = "normal"
            }
            else if(config.name === "LuaPanda-Attach"){
                config.tag = "attach"
            }
            // config.name === "LuaPanda-DebugFile" 是对 3.1.0 版本的兼容
            else if(config.name === "LuaPanda-IndependentFile" || config.name === "LuaPanda-DebugFile" ){
                config.tag = "independent_file"
            }

        }

        // 关于打开调试控制台的自动设置
        if(config.tag === "independent_file"){
            if(!config.internalConsoleOptions){
                config.internalConsoleOptions = "neverOpen";
            }
        }else{
            if(!config.internalConsoleOptions){
                config.internalConsoleOptions = "openOnSessionStart";
            }
        }

        // rootFolder 固定为 ${workspaceFolder}, 用来查找本项目的launch.json.
        config.rootFolder = '${workspaceFolder}';

        if (!config.TempFilePath) {
            config.TempFilePath = '${workspaceFolder}';
        }

        // 开发模式设置
        if( config.DevelopmentMode !== true ){
            config.DevelopmentMode = false;
        }

        // attach 模式这里不用赋初值，后面会拷贝luapanda模式的配置信息
        if(config.tag !== "attach"){
            if(!config.program){
                config.program = '';
            }

            if(config.packagePath == undefined){
                config.packagePath = [];
            }
            
            if(config.truncatedOPath == undefined){
                config.truncatedOPath = "";
            }

            if(config.distinguishSameNameFile == undefined){
                config.distinguishSameNameFile = false;
            }

            if(config.dbCheckBreakpoint == undefined){
                config.dbCheckBreakpoint = false;
            }

            if(!config.args){
                config.args = new Array<string>();
            }

            if(config.autoPathMode == undefined){
                // 默认使用自动路径模式
                config.autoPathMode = true;
            }
            
            if (!config.cwd) {
                config.cwd = '${workspaceFolder}';
            }

            if (!config.luaFileExtension) {
                config.luaFileExtension = '';
            }else{
                // luaFileExtension 兼容 ".lua" or "lua"
                let firseLetter = config.luaFileExtension.substr(0, 1);
                if(firseLetter === '.'){
                    config.luaFileExtension =  config.luaFileExtension.substr(1);
                }
            }

            if (config.stopOnEntry == undefined) {
                config.stopOnEntry = true;
            }
    
            if (config.pathCaseSensitivity == undefined) {
                config.pathCaseSensitivity = false;
            }
    
            if (config.connectionPort == undefined) {
                config.connectionPort = 8818;
            }
    
            if (config.logLevel == undefined) {
                config.logLevel = 1;
            }
    
            if (config.autoReconnect != true) {
                config.autoReconnect = false;
            }
    
            if (config.updateTips == undefined) {
                config.updateTips = true;
            }
    
            if (config.useCHook == undefined) {
                config.useCHook = true;
            }
            config.useCHook = false;
    
            if (config.isNeedB64EncodeStr == undefined) {
                config.isNeedB64EncodeStr = true;
            }

            if (config.VSCodeAsClient == undefined) {
                config.VSCodeAsClient = false;
            }

            if (config.connectionIP == undefined) {
                config.connectionIP = "127.0.0.1";
            }
        }
        
        if (!this._server) {
            this._server = Net.createServer(socket => {
                const session = new LuaDebugSession();
                session.setRunAsServer(true);
                session.start(<NodeJS.ReadableStream>socket, socket);
            }).listen(0);
        }
        // make VS Code connect to debug server instead of launching debug adapter
        // https://stackoverflow.com/questions/53736253/type-string-addressinfo-has-no-property-port-and-no-string-index-signature
        const { port } = this._server.address() as Net.AddressInfo;
        config.debugServer = port;
        return config;
    }

    dispose() {
        if (this._server) {
            this._server.close();
        }
    }
}

export function activate(context: ExtensionContext) {
    // force garbage collect
    let LuaGarbageCollect = vscode.commands.registerCommand('mylua.LuaGarbageCollect', function () {
        for (var [ , instance] of LuaDebugSession.debugSessionArray) {
            instance.LuaGarbageCollect();
        }
        vscode.window.showInformationMessage('Lua Garbage Collect!');
    });
    context.subscriptions.push(LuaGarbageCollect);
    let openSettingsPage = vscode.commands.registerCommand('mylua.openSettingsPage', function () {
        //先尝试获取数据，如果数据获取失败，给错误提示。
        try{
            let launchData = VisualSetting.getLaunchData(PathManager.rootFolderArray);
            // 和VSCode的交互
            let panel: vscode.WebviewPanel = vscode.window.createWebviewPanel(
                'mylua Setting',
                'mylua Setting',
                vscode.ViewColumn.One,
                {
                    retainContextWhenHidden: true,
                    enableScripts: true
                }
            );
            
            panel.webview.html = Tools.readFileContent(Tools.VSCodeExtensionPath + '/res/web/settings.html');
            // Handle messages from the webview
            panel.webview.onDidReceiveMessage(message => {
                VisualSetting.getWebMessage(message)
            },
                undefined,
                context.subscriptions
            );

            panel.webview.postMessage(launchData);
        }catch (error) {
            DebugLogger.showTips("解析 launch.json 文件失败, 请检查此文件配置项是否异常, 或手动修改 launch.json 中的项目来完成配置!", 2);   
        }
    
    });
    context.subscriptions.push(openSettingsPage);

    const provider = new MyLuaConfigurationProvider();
    context.subscriptions.push(vscode.debug.registerDebugConfigurationProvider('lua', provider));
    context.subscriptions.push(provider);



}

export async function deactivate() {

    return undefined;
}
