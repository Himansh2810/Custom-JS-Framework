# Custom React-like JavaScript Framework (RectorJS)

A lightweight UI framework inspired by React and JSX syntax but with a unique rendering approach. 
This project is designed to explore component-based architecture and built on concept of directly updating DOM (reative way) instead of re-rendering whole component.

## 🚀 Features

- JSX-like syntax for building components
- Component-based architecture
- Custom rendering mechanism different from React’s Virtual DOM
- Lightweight and fast
- Easy to use Routing sysytem
- Caching Query mechenism

## 📝 Usage

```javascript
import { initState, Elements as E } from 'rector-js';

initState('user',{name:'john',age:22});

function Child(){
   return (
     <>
       <E.div>Hey [[$.user.name]], counter is : [[Home.count]]</E.div>
     </>
   )
}

function Home(){
  const setCount = initState('count',0);

  return (
   <E.div>
      <E.span class="text-xl">Hey [[$.user.name]], counter is :[[count]]</E.span>
      <E.button onclick={() => setCount(prev => prev + 1)}>Increase counter</E.button>
      <Child/>
   </E.div>
  )
}
```

## NOTE :
 - It uses string template for rendering state value , write your state name in [[state_name]] it will be parsed with its real value.
 - If you declare `initState` outside of component then it will became a `globalState` can accible allover your app anywhere using `$` namespace.
   Example: In Home component & Child component , you can access globalState 'user' by writing :  `[[$.user.name]]`
 - Don't have to pass props to child , in child component use parent component namespace directly.
   Like in above code example , `Child` component's parent is `Home` , so for accessing `Home`'s state `count` inside Child you can write as `[[Home.count]]`
