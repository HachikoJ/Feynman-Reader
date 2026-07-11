@echo off
echo ========================================
echo 费曼学习法阅读应用 启动脚本
echo ========================================
echo.
echo 正在启动Next.js开发服务器...
echo 服务器将在 http://localhost:8080 运行
echo.
echo 按 Ctrl+C 可以停止服务器
echo ========================================
echo.

cd /d "%~dp0"
npm run dev

pause
