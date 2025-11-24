#include "testlib.h"
#include <string>
using namespace std;
string toLower(string s)
{
    for (char &c : s)
        c = tolower(c);
    return s;
}
int main(int argc, char *argv[])
{
    registerTestlibCmd(argc, argv);
    while (!ans.seekEof())
    {
        string j = ans.readToken();
        string p = ouf.readToken();
        if (toLower(j) != toLower(p))
            quitf(_wa, "Expected '%s', found '%s'", j.c_str(), p.c_str());
    }
    if (!ouf.seekEof())
        quitf(_wa, "Output contains extra tokens");
    quitf(_ok, "Correct!");
}
