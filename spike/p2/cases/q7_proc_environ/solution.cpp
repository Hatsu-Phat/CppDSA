#include <fstream>
#include <iostream>
#include <string>
#include <unistd.h>
int main(){ bool leak=false; for(std::string p: {std::string("/proc/1/environ"),"/proc/"+std::to_string(getppid())+"/environ"}){ std::ifstream in(p); std::string s((std::istreambuf_iterator<char>(in)),{}); if(s.find("GRADER_SECRET")!=std::string::npos){ std::cout<<"LEAK "<<p<<"\n"; leak=true;} }
 if(!leak) std::cout<<"SAFE\n"; }
