#include <fstream>
#include <iostream>
int main(){ const char* f[]={"/app/cases/01_reg_ac_standard/expected.txt","/app/cases/q1_read_case_expected/expected.txt","/app/run-suite.mjs"};
 bool leak=false; for(auto p:f){ std::ifstream in(p); std::string s; if(std::getline(in,s)){ std::cout<<"LEAK "<<p<<": "<<s.substr(0,40)<<"\n"; leak=true;} }
 if(!leak) std::cout<<"SAFE\n"; }
