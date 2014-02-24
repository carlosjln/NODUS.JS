@ECHO off
CLS

SET "feed=C:\Workenv\Tools\Nuget\feed\"
SET "prev=%feed%..\previous_versions\"
SET solution_dir=%1

IF NOT EXIST %feed% MKDIR %feed%
IF NOT EXIST %prev% MKDIR %prev%

IF EXIST %feed%"NODUS.JS.1*" MOVE /Y %feed%"NODUS.JS.1*" %prev%

echo.
CALL "%solution_dir%Tools\NuGet.exe" pack %solution_dir%NODUS.JS\NODUS.JS.nuspec -Verbosity normal -NoPackageAnalysis -Properties Configuration=Release -OutputDirectory %feed%
echo.