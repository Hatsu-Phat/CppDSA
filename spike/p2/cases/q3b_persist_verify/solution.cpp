#include <fstream>
#include <iostream>
int main(){ const char* f[]={"/home/sandbox/persist.txt","/dev/shm/persist.txt","/var/tmp/persist.txt","/run/lock/persist.txt","/dev/mqueue/persist.txt"};
 bool leak=false; for(auto p:f){ std::ifstream in(p); if(in.good()){ std::cout<<"LEAK found "<<p<<"\n"; leak=true;} }
 if(!leak) std::cout<<"SAFE\n"; }
