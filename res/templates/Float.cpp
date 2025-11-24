#include "testlib.h"
using namespace std;
int main(int argc, char **argv)
{
    registerTestlibCmd(argc, argv);
    if (abs(ouf.readDouble() - ans.readDouble()) <= 1e-5)
        quitf(_ok, "Correct!");
    else
        quitf(_wa, "Wrong Answer!");
}
