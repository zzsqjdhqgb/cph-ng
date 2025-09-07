#include <iostream>
#include <chrono>

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

int main()
{
    std::atexit(CPHNG::exit);
    CPHNG::start();
    int ret = original_main();
    return ret;
}
