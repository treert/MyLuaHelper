package strbytesconv

import (
	"unsafe"
)

// 这儿的两个函数有些危险呀。string 是不可变的，[]byte 是可变的，直接转换可能会引发问题。

// StringToBytes 实现string 转换成 []byte, 不用额外的内存分配
func StringToBytes(str string) (bytes []byte) {
	return unsafe.Slice(unsafe.StringData(str), len(str))
	// ss := *(*reflect.StringHeader)(unsafe.Pointer(&str))
	// bs := (*reflect.SliceHeader)(unsafe.Pointer(&bytes))
	// bs.Data = ss.Data
	// bs.Len = ss.Len
	// bs.Cap = ss.Len
	// return bytes
}

// BytesToString 实现 []byte 转换成 string, 不需要额外的内存分配
func BytesToString(bytes []byte) string {
	return unsafe.String(unsafe.SliceData(bytes), len(bytes))
	// return *(*string)(unsafe.Pointer(&bytes))
}
