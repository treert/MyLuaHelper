package my

import (
	"runtime"
	"sync"
)

// RunAllTask 并行执行任务，返回结果。阻塞执行
//
//	tasks 是需要处理的任务列表
//	processFunc 是处理函数，接收一个 Task 返回一个 Result
//	workerCount 是并发执行的 worker 数量。如果传入的值小于等于0，则为 CPU 核心数
func RunAllTask[Task any, Result any](
	tasks []Task,
	processFunc func(Task) Result,
	workerCount int,
) []Result {
	if len(tasks) == 0 {
		return nil
	}

	if workerCount <= 0 {
		workerCount = runtime.NumCPU()
	}
	workerCount = min(workerCount, len(tasks)) // 确保 workerCount 不超过任务数量

	taskChan := make(chan Task, len(tasks))

	// 将所有任务放入 channel
	for _, task := range tasks {
		taskChan <- task
	}
	close(taskChan) // 重要：关闭后 worker 才能正常退出 range

	resultChan := RunAllTaskInChan(taskChan, processFunc, workerCount)

	// 收集结果
	var results []Result = make([]Result, 0, len(tasks))
	// 注意：这里使用 range 读取 resultChan，直到它被关闭
	for result := range resultChan {
		results = append(results, result)
	}

	return results
}

// RunAllTaskInChan 并行执行 channel 中的任务，返回结果 channel，不阻塞执行。
func RunAllTaskInChan[Task any, Result any](
	taskChan chan Task,
	processFunc func(Task) Result,
	workerCount int,
) chan Result {
	if workerCount <= 0 {
		workerCount = runtime.NumCPU()
	}

	resultChan := make(chan Result, workerCount)

	// 启动固定数量的 worker
	var wg sync.WaitGroup
	wg.Add(workerCount)
	for i := 0; i < workerCount; i++ {
		go func() {
			defer wg.Done()
			for task := range taskChan {
				result := processFunc(task) // 用户自定义处理逻辑
				resultChan <- result
			}
		}()
	}

	// 启动一个 goroutine，在所有 worker 完成后关闭 resultChan
	go func() {
		wg.Wait()
		close(resultChan)
	}()

	return resultChan
}
