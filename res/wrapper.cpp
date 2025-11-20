#include <iostream>
#include <chrono>
#ifdef __linux__
#include <sys/resource.h>
#endif

extern "C" int original_main();

namespace CPHNG
{
    using clock = std::chrono::high_resolution_clock;
    using tp = std::chrono::time_point<clock>;
    tp startTime, endTime;
    void start()
    {
        startTime = clock::now();
    }
    void exit()
    {
        endTime = clock::now();
        std::cerr << "-----CPH DATA STARTS-----{\"time\":" << std::chrono::duration_cast<std::chrono::microseconds>(endTime - startTime).count()
                  << "}-----";
    }
}

int main(int argc, char **argv)
{
    std::atexit(CPHNG::exit);
#ifdef __linux__
    if (argc > 1 && std::string(argv[1]) == "--unlimited-stack")
    {
        struct rlimit rl;
        rl.rlim_cur = RLIM_INFINITY;
        rl.rlim_max = RLIM_INFINITY;
        if (setrlimit(RLIMIT_STACK, &rl) != 0)
            std::cerr << "Failed to set stack size limit to unlimited." << std::endl;
    }
#endif
    CPHNG::start();
    int ret = original_main();
    return ret;
}
