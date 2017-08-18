#include <iostream>
#include <vector>
#include <string>
#include <sstream>
#include <iterator>
#include <type_traits>
#include <list>
#include <deque>
#include <queue>
#include <stack>
#include <set>

using namespace std;

template<template<class, class> class Container, typename T>
std::string toString(const Container<T, std::allocator<T>>& container)
{
    ostringstream oss;
    for (auto& val: container)
    {
      oss << val << " ";
    }
    return oss.str();
}

template<template<typename...> class Container, typename T, typename = typename std::enable_if<std::is_arithmetic<T>::value, T>::type>
void printContainer()
{
  Container<T, std::allocator<T>> container = {1, 2, 3, 4, 5};
  std::cout << toString(container) << std::endl;
}

template<template<typename...> class Container>
void printContainers()
{
  printContainer<Container, int>();
  printContainer<Container, float>(); 
  printContainer<Container, long>(); 
  printContainer<Container, double>(); 
  printContainer<Container, unsigned int>();
  printContainer<Container, unsigned long>();
  printContainer<Container, short>();
  printContainer<Container, unsigned short>();
  printContainer<Container, char>();
  printContainer<Container, unsigned char>();
  printContainer<Container, long long>();
  printContainer<Container, long double>();
}

int main()
{
  printContainers<vector>(); 
  printContainers<list>();
  printContainers<deque>();

  return 0;
}
