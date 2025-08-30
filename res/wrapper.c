#include <iostream>
#include <chrono>

#ifdef _WIN32
#include <windows.h>
#include <psapi.h>
#else
#include <sys/resource.h>
#include <unistd.h>
#include <sys/wait.h>
#endif

extern "C" int original_main();

int main()
{
    using clock = std::chrono::high_resolution_clock;
#ifdef _WIN32
    STARTUPINFO si = {sizeof(si)};
    PROCESS_INFORMATION pi;
    auto startTime = clock::now();
    if (CreateProcess(NULL, "original.exe", NULL, NULL, FALSE, 0, NULL, NULL, &si, &pi))
    {
        WaitForSingleObject(pi.hProcess, INFINITE);
        auto endTime = clock::now();
        PROCESS_MEMORY_COUNTERS memInfo;
        if (GetProcessMemoryInfo(pi.hProcess, &memInfo, sizeof(memInfo)))
        {
            long long peakMem = memInfo.PeakWorkingSetSize / 1024;
            std::cerr << "-----CPH DATA STARTS-----{\"time\":" << std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count()
                      << ",\"memory\":" << peakMem << "}-----";
        }
        DWORD exitCode;
        GetExitCodeProcess(pi.hProcess, &exitCode);
        CloseHandle(pi.hProcess);
        CloseHandle(pi.hThread);
        return exitCode;
    }
    else
    {
        return 1;
    }
#else
    auto startTime = clock::now();
    pid_t pid = fork();
    if (pid == 0)
    {
        _exit(original_main());
    }
    else if (pid > 0)
    {
        int status;
        waitpid(pid, &status, 0);
        auto endTime = clock::now();
        struct rusage rusage;
        getrusage(RUSAGE_CHILDREN, &rusage);
        long long peakMem = rusage.ru_maxrss;
        std::cerr << "-----CPH DATA STARTS-----{\"time\":" << std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count()
                  << ",\"memory\":" << peakMem << "}-----";
        return WEXITSTATUS(status);
    }
    else
    {
        return 1;
    }
#endif
}
