#include <cstdio>
#include <iostream>
int main(){ static char b[4096]; for(int i=0;i<4096;i++) b[i]='E'; for(int i=0;i<200000;i++) fwrite(b,1,4096,stderr); std::cout<<"SAFE\n"; }
