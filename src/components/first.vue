<template>
    <div>
        <h1>I am the first component</h1>
        <p>I want to output:<span class='dataStyle'>{{dataContent}}</span></p>
        </div>
</template>

<script>
export default {
    data(){
        return{
            dataContent:"I am dongtai data"
        }
    }
}
</script>

<style>
.dataStyle{
    color:red;
    }
</style>


