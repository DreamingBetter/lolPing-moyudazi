@echo off
setlocal EnableExtensions
set "VSWHERE=%ProgramFiles(x86)%\Microsoft Visual Studio\Installer\vswhere.exe"
if not exist "%VSWHERE%" (
  echo vswhere.exe not found. Install Visual Studio 2022 with the "Desktop development with C++" workload.
  exit /b 1
)
set "VSWHERE_OUT=%TEMP%\lolping-vswhere-%RANDOM%.txt"
"%VSWHERE%" -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath > "%VSWHERE_OUT%" || exit /b 1
set /p VSDIR=<"%VSWHERE_OUT%"
del "%VSWHERE_OUT%" >nul 2>nul
if not defined VSDIR (
  echo No Visual Studio installation with the C++ x64 tools was found.
  exit /b 1
)
set "VCTOOLSFILE=%VSDIR%\VC\Auxiliary\Build\Microsoft.VCToolsVersion.default.txt"
if exist "%VCTOOLSFILE%" (
  set /p VCTOOLS=<"%VCTOOLSFILE%"
) else (
  set "MSVC_OUT=%TEMP%\lolping-msvc-%RANDOM%.txt"
  dir "%VSDIR%\VC\Tools\MSVC" /b /ad-h /on > "%MSVC_OUT%" || exit /b 1
  for /f "usebackq delims=" %%i in ("%MSVC_OUT%") do set "VCTOOLS=%%i"
  del "%MSVC_OUT%" >nul 2>nul
)
if not defined VCTOOLS (
  echo No MSVC toolset was found.
  exit /b 1
)
set "VCROOT=%VSDIR%\VC\Tools\MSVC\%VCTOOLS%"
if not exist "%VCROOT%\bin\Hostx64\x64\cl.exe" (
  echo cl.exe not found under "%VCROOT%".
  exit /b 1
)
set "WINSDKROOT=%ProgramFiles(x86)%\Windows Kits\10"
set "SDK_OUT=%TEMP%\lolping-sdk-%RANDOM%.txt"
dir "%WINSDKROOT%\Include" /b /ad-h /on > "%SDK_OUT%" || exit /b 1
for /f "usebackq delims=" %%i in ("%SDK_OUT%") do set "SDKVER=%%i"
del "%SDK_OUT%" >nul 2>nul
if not defined SDKVER (
  echo No Windows 10 SDK was found.
  exit /b 1
)
set "PATH=%VCROOT%\bin\Hostx64\x64;%WINSDKROOT%\bin\%SDKVER%\x64;%PATH%"
set "INCLUDE=%VCROOT%\include;%WINSDKROOT%\Include\%SDKVER%\ucrt;%WINSDKROOT%\Include\%SDKVER%\um;%WINSDKROOT%\Include\%SDKVER%\shared;%WINSDKROOT%\Include\%SDKVER%\winrt;%WINSDKROOT%\Include\%SDKVER%\cppwinrt"
set "LIB=%VCROOT%\lib\x64;%WINSDKROOT%\Lib\%SDKVER%\ucrt\x64;%WINSDKROOT%\Lib\%SDKVER%\um\x64"
cd /d "%~dp0"
if not exist build\obj mkdir build\obj
set FLAGS=/nologo /std:c++20 /EHsc /W4 /WX /utf-8 /MT /DUNICODE /D_UNICODE /Fobuild\obj\
cl %FLAGS% /O2 src\main_win.cpp src\hooks_win.cpp src\simulate.cpp src\commands.cpp src\output.cpp src\json.cpp src\decision.cpp /Fe:build\hook-helper.exe /link user32.lib || exit /b 1
cl %FLAGS% /Od tests\helper_tests.cpp src\decision.cpp src\commands.cpp src\macinput.cpp src\json.cpp src\output.cpp /Fe:build\helper_tests.exe || exit /b 1
echo Built build\hook-helper.exe and build\helper_tests.exe
