import * as vscode from 'vscode';
import { StatusBarItem } from 'vscode';
import { Tools } from './tools';

export class StatusBarManager {

    private static MemStateBar:StatusBarItem;
    private static MainBar:StatusBarItem;

    public static init() {
        this.MemStateBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 5.0);
        this.MemStateBar.tooltip = "Click to collect garbage";
        this.MemStateBar.command = 'mylua.LuaGarbageCollect';


        let bar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left,7);
        bar.tooltip = 'mylua tip';
        bar.text = "💚mylua";
        bar.command = 'mylua.status.bar.click';
        this.MainBar = bar;

        Tools.context.subscriptions.push(vscode.commands.registerCommand('mylua.status.bar.click', () => {
            vscode.commands.executeCommand("mylua.openSettingsPage");
        }));
    }

    //刷新内存数据显示区的值
    public static refreshLuaMemNum(num: Number) {
        this.MemStateBar.text = String(num) + "KB";
        this.MemStateBar.show();
    }
    
    public static ShowMain(message: string) {
        if (Tools.context.extensionMode !== vscode.ExtensionMode.Production) {
            message += ` ${Tools.context.extensionMode}`;
        }
        this.MainBar.text = message;
        this.MainBar.show();
    }

    //按钮恢复到初始状态
    public static reset() {
        this.MemStateBar.hide();
    }
}
