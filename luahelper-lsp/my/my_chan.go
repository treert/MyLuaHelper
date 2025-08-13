package my

import (
	"runtime"
	"sync"
)

// 泛型类型 MyChan[T any]，本质是一个 chan T 的封装
type MyChan[T any] chan T

// 方法：发送一个值到 channel
func (ch MyChan[T]) Send(value T) {
	ch <- value
}

// 方法：从 channel 接收一个值
func (ch MyChan[T]) Receive() T {
	return <-ch
}

// 方法：关闭 channel
func (ch MyChan[T]) CloseChan() {
	close(ch)
}

// 方法：尝试发送，成功返回 true，失败（如满）返回 false
func (ch MyChan[T]) TrySend(value T) bool {
	select {
	case ch <- value:
		return true
	default:
		return false
	}
}

// 方法：尝试接收，成功返回值和 true，失败返回零值和 false
func (ch MyChan[T]) TryReceive() (T, bool) {
	select {
	case v := <-ch:
		return v, true
	default:
		var zero T
		return zero, false
	}
}

// 方法：将 channel 转换为切片，读取所有元素
func (ch MyChan[T]) ToSlice() []T {
	var result []T
	for item := range ch {
		result = append(result, item)
	}
	return result
}

// Filter 并行处理 channel 中的元素，并过滤出一些元素进入返回通道中。
//
// f 自定义的过滤函数，接收一个 *T，可以修改T的值。返回 bool，true 表示保留该元素，false 表示丢弃。
func (ch MyChan[T]) Filter(f func(*T) bool) MyChan[T] {
	workerCount := runtime.NumCPU()
	result := make(MyChan[T], workerCount)
	// 启动固定数量的 worker
	var wg sync.WaitGroup
	wg.Add(workerCount)
	for i := 0; i < workerCount; i++ {
		go func() {
			defer wg.Done()
			for task := range ch {
				ok := f(&task) // 用户自定义处理逻辑
				if ok {
					result <- task
				}
			}
		}()
	}

	// 启动一个 goroutine，在所有 worker 完成后关闭 resultChan
	go func() {
		wg.Wait()
		close(result)
	}()
	return result
}

// Map 并行的将 MyChan 中的每个元素通过函数 f 转换为新类型，并返回一个新的 channel
//
// 这是一个独立的泛型函数，goland 现在还不支持泛型类型上附加泛型方法
func Map[T, R any](ch MyChan[T], f func(T) R) MyChan[R] {
	result_chan := RunAllTaskInChan(ch, f, runtime.NumCPU())
	return result_chan
}

// NewMyChanFromSlice 根据 []T 创建一个 MyChan[T]
//
// 将所有元素 Send 到 channel 中，发送完毕后关闭 channel
func NewMyChanFromSlice[T any](items []T) MyChan[T] {
	ch := make(MyChan[T], len(items)) // 缓冲大小 = len(items)，避免阻塞

	// 将所有 items 发送到 channel 中
	for _, item := range items {
		ch.Send(item)
	}

	ch.CloseChan() // 发送完毕后关闭 channel
	return ch
}
