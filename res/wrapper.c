#include <iostream>
#include <chrono>

#ifdef _WIN32
#include <windows.h>
#include <psapi.h>
#include <shlwapi.h>
#include <cstdio>
#include <cstring>
#else
#include <sys/resource.h>
#include <unistd.h>
#include <sys/wait.h>
#endif

extern "C" int original_main();

int main()
{
    using clock = std::chrono::high_resolution_clock;
    auto startTime = clock::now();
#ifdef _WIN32
    int status = original_main();
    auto endTime = clock::now();

    PROCESS_MEMORY_COUNTERS pmc;
    if (GetProcessMemoryInfo(GetCurrentProcess(), &pmc, sizeof(pmc)))
    {
        std::cerr << "-----CPH DATA STARTS-----{\"time\":" << std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count()
                  << ",\"memory\":" << pmc.PeakWorkingSetSize / 1024 << "}-----";
    }
    return status;
#else
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
