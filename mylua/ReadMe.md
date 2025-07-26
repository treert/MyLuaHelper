## mylua IDE 支持
根据个人喜好定制修改了个 [mylua](https://github.com/treert/lua)，并准备补充工具库成 [mylua 整合包](https://github.com/treert/mylua)。

原来想用 c# 写个 lsp 服务器的。未能坚持下来，对 lua 的热情减退了，烂尾了。
另外编程环境也有变化：
- 有了**ai编程**后，**python**变得好用了。
- 现在的 dart 接近理想中的lua状态，**可惜 dart 不干净**。
  - 有些地方不理想，比如不支持类似 raii 的作用域退出回调，lua5.4 都支持 `<close>`。

mylua 的运行时已经足够完善了，就这么放着有些可惜，也许以后还有用。
烂尾的 lsp 得补救下。就想着修改现有的 lua vscode 插件来支持下。有两个候选
1. [sumneko](https://github.com/LuaLS/lua-language-server)
   - 大佬用 lua 开发的 lua_lsp
2. [luahelper](https://github.com/Tencent/LuaHelper)
   - 腾讯开源的 go 实现的 lua_lsp

当把 go 当成 c with gc 后，对 go 的观感变好了。luahelper 的性能潜力很大，就选它了，正好更加熟悉下 go 。

