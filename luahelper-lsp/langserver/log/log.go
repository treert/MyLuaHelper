package log

import (
	"context"
	"fmt"
	"io"
	"log"
	"os"

	"github.com/yinfei8/jrpc2"
)

var (
	debugLog *log.Logger
	errorLog *log.Logger
	LspLog   *log.Logger
)

type logger = func(string, ...interface{})

var GFileLog *os.File = nil

var _rpc_log_file *os.File = nil
var _rpc_log *log.Logger = nil

// logFlag 为true表示开启日志
func InitLog(logFlag bool) {
	if !logFlag {
		debugLog = nil
		errorLog = nil
		LspLog = nil
		log.SetFlags(0)
		return
	}

	log.SetFlags(log.Ldate | log.Lmicroseconds | log.Llongfile)
	fileLog, err := os.OpenFile("log.txt", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0666)
	if err != nil {
		log.Fatalln("failed to open log file:", err)
		return
	}

	_rpc_log_file, _ = os.OpenFile("rpc.log", os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0666)
	if _rpc_log_file != nil {
		_rpc_log = log.New(io.MultiWriter(_rpc_log_file), "", log.Ldate|log.Lmicroseconds)
	}

	debugLog = log.New(io.MultiWriter(fileLog), "Debug ", log.Ldate|log.Lmicroseconds|log.Lshortfile)
	errorLog = log.New(io.MultiWriter(fileLog), "Error ", log.Ldate|log.Lmicroseconds|log.Lshortfile)

	LspLog = debugLog
	GFileLog = fileLog
}

// 是否关闭日志
func CloseLog() {
	if GFileLog != nil {
		GFileLog.Close()
	}
}

func Debug(format string, v ...interface{}) {
	if debugLog == nil {
		return
	}

	debugLog.Output(2, fmt.Sprintf(format, v...))
}

func Error(format string, v ...interface{}) {
	if errorLog == nil {
		return
	}

	errorLog.Output(2, fmt.Sprintf(format, v...))
}

type RPCLogger struct {
}

func (RPCLogger) LogRequest(ctx context.Context, req *jrpc2.Request) {
	if _rpc_log != nil {
		_rpc_log.Printf("id: %s, request: %s, params: %s", req.ID(), req.Method(), req.ParamString())
	}
}
func (RPCLogger) LogResponse(ctx context.Context, rsp *jrpc2.Response) {
	if _rpc_log != nil {
		if rsp.Error() != nil {
			_rpc_log.Printf("response: id: %s, error: %s, result: %s", rsp.ID(), rsp.Error().Error(), rsp.ResultString())
			return
		} else {
			_rpc_log.Printf("response: id: %s, result: %s", rsp.ID(), rsp.ResultString())
		}
	}
}
