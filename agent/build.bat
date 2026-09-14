@echo off
echo Installing requirements...
pip install -r requirements.txt

echo.
echo Building GPU Node Agent Executable...
pyinstaller --onefile --name "NodeAgent" main.py

echo.
echo Build complete. The executable is located in the dist\ folder.
pause
